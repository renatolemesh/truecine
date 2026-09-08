const express = require('express');
const requireAuth = require('../middleware/auth');
const { client } = require('../db/qdrant');
const { db } = require('../db/sqlite');
const config = require('../config');
const allMovies = require('../data/movies');
const { calculateAge } = require('../services/age');
const { buildUserVector } = require('../services/vectorizer');

const router = express.Router();

const findUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const ownFeedbackStmt = db.prepare('SELECT movie_id, rating FROM feedback WHERE user_id = ?');

const DEFAULT_CANDIDATES = 150;
const MAX_CANDIDATES = 300;
const DEFAULT_NEGATIVES = 60;

// "Feedback coletivo": além dos candidatos por similaridade de conteúdo
// (Qdrant contra o vetor do próprio usuário), buscamos o que gente com
// perfil parecido (mesmo país, idade próxima) avaliou bem — notas
// guardadas na tabela `feedback` toda vez que alguém avalia um título (as
// estrelas no card, ou implicitamente ao marcar "já curtiu" no cadastro —
// ver routes/feedback.js). É o mesmo princípio de um sistema colaborativo:
// o histórico de uns alimenta a recomendação dos próximos com perfil
// parecido, mesmo que nunca tenham interagido com aquele título.
const COLLAB_MIN_COHORT = 5; // abaixo disso, o filtro é considerado "de menos" e afrouxa
const COLLAB_LIMIT = 20;
const COLLAB_AGE_WINDOW = 7;
const COLLAB_POSITIVE_RATING = 7; // só notas "recomendo" (equivalente a 4-5 estrelas) contam como sinal

// Do mais específico pro mais genérico — a primeira tentativa que juntar
// gente suficiente (COLLAB_MIN_COHORT) vence.
function cohortAttempts(userId, age, country) {
  const attempts = [];
  if (country && age) {
    attempts.push({
      where: 'rating >= ? AND country = ? AND age BETWEEN ? AND ? AND user_id != ?',
      params: [COLLAB_POSITIVE_RATING, country, age - COLLAB_AGE_WINDOW, age + COLLAB_AGE_WINDOW, userId],
    });
  }
  if (country) {
    attempts.push({
      where: 'rating >= ? AND country = ? AND user_id != ?',
      params: [COLLAB_POSITIVE_RATING, country, userId],
    });
  }
  if (age) {
    attempts.push({
      where: 'rating >= ? AND age BETWEEN ? AND ? AND user_id != ?',
      params: [COLLAB_POSITIVE_RATING, age - COLLAB_AGE_WINDOW, age + COLLAB_AGE_WINDOW, userId],
    });
  }
  attempts.push({ where: 'rating >= ? AND user_id != ?', params: [COLLAB_POSITIVE_RATING, userId] }); // último recurso: "o que tá sendo bem avaliado em geral"
  return attempts;
}

function fetchCollaborativeCandidates(userId, profile, excludeIds) {
  const age = calculateAge(profile.birth_date);
  const country = profile.country || null;

  let rows = [];
  for (const attempt of cohortAttempts(userId, age, country)) {
    rows = db.prepare(`SELECT movie_id, rating FROM feedback WHERE ${attempt.where}`).all(...attempt.params);
    if (rows.length >= COLLAB_MIN_COHORT) break;
  }

  // Por título: quantas avaliações positivas teve nessa coorte + a média
  // das notas — desempata o ranking quando dois títulos têm a mesma
  // contagem (um com nota média 10 vale mais que um com média 7).
  const stats = new Map();
  for (const row of rows) {
    if (excludeIds.has(row.movie_id)) continue;
    const cur = stats.get(row.movie_id) || { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += row.rating;
    stats.set(row.movie_id, cur);
  }

  return [...stats.entries()]
    .sort((a, b) => (b[1].count - a[1].count) || (b[1].sum / b[1].count - a[1].sum / a[1].count))
    .slice(0, COLLAB_LIMIT)
    .map(([movieId, s]) => {
      const movie = allMovies.find((m) => m.id === movieId);
      if (!movie) return null;
      return {
        ...movie,
        collaborativeCount: s.count,
        collaborativeAvgRating: Math.round((s.sum / s.count) * 10) / 10,
      };
    })
    .filter(Boolean);
}

function sampleRandom(pool, size, excludeIds) {
  // Amostra aleatória simples (Fisher-Yates parcial) usada só para gerar
  // exemplos "negativos" de treino — não precisa ser criptograficamente
  // forte, só razoavelmente espalhada pelo catálogo.
  const filtered = pool.filter((m) => !excludeIds.has(m.id));
  const picked = [];
  const used = new Set();
  const attempts = Math.min(filtered.length, size * 5);
  for (let i = 0; i < attempts && picked.length < size; i += 1) {
    const idx = Math.floor(Math.random() * filtered.length);
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push(filtered[idx]);
  }
  return picked;
}

// O Qdrant faz a parte de recuperação (candidate retrieval): busca por
// similaridade de cosseno os filmes/séries com vetor de conteúdo mais
// parecido com o vetor de preferências do usuário — isso é rápido mesmo
// com o catálogo inteiro (~20 mil pontos) graças ao índice vetorial (ANN).
// O vetor do usuário é uma função pura do perfil (gêneros favoritos, idade,
// tipo preferido, títulos curtidos) — recalculado aqui na hora a partir do
// SQLite, sem precisar guardá-lo em lugar nenhum.
//
// O que este endpoint devolve não é a lista final: são CANDIDATOS (`items`)
// + uma amostra aleatória de filmes pouco relevantes (`negativeSamples`).
// O front usa isso como dado de treino sintético para uma rede neural
// (TensorFlow.js, rodando num Web Worker no navegador — ver
// frontend/src/workers/recommendationWorker.js) que reordena os
// candidatos. Esse é o mesmo papel que a rede do projeto de referência
// cumpria, só que aqui o Qdrant filtra o universo de milhares de títulos
// para um punhado de candidatos plausíveis antes da rede entrar em ação.
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_CANDIDATES, MAX_CANDIDATES);
    const negativeSampleSize = Number(req.query.negativeSampleSize) || DEFAULT_NEGATIVES;

    const profile = findUserStmt.get(req.userId);
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    const ownFeedback = ownFeedbackStmt.all(req.userId);
    const ratedIds = ownFeedback.map((r) => r.movie_id);

    // O vetor do usuário não fica congelado no que foi informado no
    // cadastro: títulos avaliados bem depois (estrelas no card) entram
    // aqui junto com os marcados como "já curtiu" no formulário — o perfil
    // vai se ajustando com o uso real, não só com a resposta inicial. Não
    // é guardado em lugar nenhum: como o vetor é recalculado a cada request
    // (ver services/vectorizer.js), continuar realimentando é só ampliar de
    // onde vêm os "títulos curtidos" que entram nessa conta.
    const likedMovieIds = JSON.parse(profile.liked_movie_ids || '[]');
    const positivelyRatedIds = ownFeedback
      .filter((r) => r.rating >= COLLAB_POSITIVE_RATING)
      .map((r) => r.movie_id);
    const likedMovieIdSet = new Set([...likedMovieIds, ...positivelyRatedIds]);
    const likedMovies = [...likedMovieIdSet].map((id) => allMovies.find((m) => m.id === id)).filter(Boolean);

    const userVector = buildUserVector({
      favoriteGenres: JSON.parse(profile.favorite_genres || '[]'),
      age: calculateAge(profile.birth_date),
      preferredType: profile.preferred_type,
      likedMovies,
    });

    // Título que o usuário já avaliou (nas estrelas do card, qualquer
    // nota) não devia continuar aparecendo como "recomendado" — se já deu
    // nota é porque já assistiu/já formou opinião, recomendar de novo não
    // ajuda em nada (e ficava "preso" ali até a próxima vez que a rede
    // treinasse com uma amostra diferente, o que é confuso).
    const excludeIds = new Set([...likedMovieIds, ...ratedIds]);

    const results = await client.search(config.MOVIES_COLLECTION, {
      vector: userVector,
      limit: limit + excludeIds.size,
      with_payload: true,
    });

    const items = results
      .filter((r) => !excludeIds.has(r.payload.id))
      .slice(0, limit)
      .map((r) => ({ ...r.payload, score: Math.round(r.score * 1000) / 1000 }));

    const itemIds = new Set(items.map((m) => m.id));
    const collaborative = fetchCollaborativeCandidates(
      req.userId,
      profile,
      new Set([...excludeIds, ...itemIds]),
    );

    // Entram como candidatos extras (rótulo "relevante" pro treino do
    // TF.js, igual aos do Qdrant) — não substituem o ranking por conteúdo,
    // só ampliam o universo de candidatos com o que gente parecida curtiu.
    const mergedItems = [...items, ...collaborative];
    const mergedIds = new Set(mergedItems.map((m) => m.id));
    const negativeSamples = sampleRandom(allMovies, negativeSampleSize, new Set([...excludeIds, ...mergedIds]));

    res.json({
      userVector,
      items: mergedItems,
      negativeSamples,
      collaborativeCount: collaborative.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao gerar recomendações' });
  }
});

module.exports = router;
