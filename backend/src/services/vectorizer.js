// Este arquivo é o coração do "modelo" de recomendação — inspirado no
// modelTrainingWorker.js do projeto de e-commerce que serviu de referência:
// lá, produto e usuário viravam vetores numéricos normalizados (0–1) e a rede
// aprendia a comparar os dois. Aqui trocamos a rede neural por um banco
// vetorial (Qdrant): tanto o filme/série quanto o usuário viram um vetor no
// MESMO espaço, e a recomendação é simplesmente "quais filmes têm o vetor
// mais parecido (cosine similarity) com o vetor do usuário".
//
// Vetor = [ ...one-hot de gêneros (18) , ano normalizado , nota normalizada , tipo , faixa etária/classificação ]

const GENRES = require('../data/genres');

const YEAR_MIN = 1950;
const YEAR_MAX = 2026;

const MATURITY_TO_VALUE = {
  G: 0.1,
  PG: 0.3,
  'PG-13': 0.5,
  R: 0.8,
};

const VECTOR_SIZE = GENRES.length + 4;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Converte um filme/série do catálogo em um vetor numérico.
 */
function buildMovieVector(movie) {
  const rawGenreVector = GENRES.map((g) => (movie.genres.includes(g) ? 1 : 0));
  const genreTotal = rawGenreVector.reduce((a, b) => a + b, 0) || 1;
  // Normalizado para somar 1: um filme com 3 gêneros não "pesa mais" que um com 1.
  const genreVector = rawGenreVector.map((v) => v / genreTotal);

  const yearNorm = clamp01((movie.year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN));
  const ratingNorm = clamp01(movie.rating / 10);
  const typeVal = movie.type === 'serie' ? 1 : 0;
  const maturityVal = MATURITY_TO_VALUE[movie.maturity] ?? 0.5;

  return [...genreVector, yearNorm, ratingNorm, typeVal, maturityVal];
}

/**
 * A idade do usuário não vira um "peso" por gênero (evitamos estereótipo do
 * tipo "jovem = ação"). Em vez disso ela é traduzida para uma classificação
 * indicativa alvo, no MESMO eixo usado pelos filmes — assim o banco vetorial
 * naturalmente aproxima o usuário de conteúdo com classificação compatível.
 */
function ageToMaturityTarget(age) {
  const n = Number(age);
  if (!n || Number.isNaN(n)) return 0.6;
  if (n < 13) return 0.15;
  if (n < 16) return 0.35;
  if (n < 18) return 0.5;
  return clamp01(0.55 + (n - 18) * 0.01);
}

/**
 * Converte o perfil de um usuário (gêneros favoritos, idade, tipo preferido
 * e, opcionalmente, alguns títulos que ele já curtiu) em um vetor no mesmo
 * espaço dos filmes.
 */
// Nota: o perfil do usuário também guarda `country` (país de origem,
// coletado no cadastro), mas ele NÃO entra no vetor abaixo — o catálogo
// (Kaggle + IMDb) não tem país de produção por título, só ano/gêneros/
// nota/duração. Pra virar um fator real de similaridade seria preciso
// enriquecer movies.json com país de origem (ex.: via TMDB) antes.
function buildUserVector({ favoriteGenres = [], age, preferredType = 'ambos', likedMovies = [] }) {
  let genreWeights = new Array(GENRES.length).fill(0);

  if (favoriteGenres.length) {
    const w = 1 / favoriteGenres.length;
    favoriteGenres.forEach((g) => {
      const idx = GENRES.indexOf(g);
      if (idx >= 0) genreWeights[idx] += w;
    });
  }

  let yearPref = 0.75; // leve preferência por lançamentos mais recentes, por padrão
  let ratingPref = 0.8; // leve preferência por conteúdo bem avaliado, por padrão

  if (likedMovies.length) {
    const vectors = likedMovies.map(buildMovieVector);
    const avg = new Array(VECTOR_SIZE).fill(0);
    vectors.forEach((v) => v.forEach((val, i) => { avg[i] += val / vectors.length; }));

    // Mistura 60% do que o usuário escolheu explicitamente como gênero
    // favorito com 40% do "sinal" extraído dos títulos que ele curtiu —
    // mesma lógica de combinar preferência declarada + histórico usada
    // no projeto de referência (histórico de compras médio).
    for (let i = 0; i < GENRES.length; i += 1) {
      genreWeights[i] = genreWeights[i] * 0.6 + avg[i] * 0.4;
    }
    yearPref = avg[GENRES.length];
    ratingPref = avg[GENRES.length + 1];
  }

  const genreSum = genreWeights.reduce((a, b) => a + b, 0);
  if (genreSum > 0) genreWeights = genreWeights.map((v) => v / genreSum);

  const typeVal = preferredType === 'filme' ? 0 : preferredType === 'serie' ? 1 : 0.5;
  const maturityVal = ageToMaturityTarget(age);

  return [...genreWeights, yearPref, ratingPref, typeVal, maturityVal];
}

module.exports = { buildMovieVector, buildUserVector, VECTOR_SIZE, GENRES };
