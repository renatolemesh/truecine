const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/sqlite');
const movies = require('../data/movies');
const { calculateAge } = require('../services/age');
const { validatePassword } = require('../services/password');
const { hashPassword, comparePassword, signToken } = require('../services/authService');
const requireAuth = require('../middleware/auth');
const { loginLimiter, accountLimiter, writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const findByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?');
const findByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUserStmt = db.prepare(`
  INSERT INTO users (
    id, name, email, password_hash, account_type, birth_date, gender, country,
    preferred_type, favorite_genres, liked_movie_ids, created_at
  ) VALUES (
    @id, @name, @email, @passwordHash, @accountType, @birthDate, @gender, @country,
    @preferredType, @favoriteGenres, @likedMovieIds, @createdAt
  )
`);
const updateUserStmt = db.prepare(`
  UPDATE users SET
    name = @name, birth_date = @birthDate, gender = @gender, country = @country,
    preferred_type = @preferredType, favorite_genres = @favoriteGenres,
    email = @email, account_type = @accountType, password_hash = @passwordHash
  WHERE id = @id
`);
const upsertFeedbackStmt = db.prepare(`
  INSERT INTO feedback (id, movie_id, user_id, rating, age, gender, country, created_at)
  VALUES (@id, @movieId, @userId, @rating, @age, @gender, @country, @createdAt)
  ON CONFLICT(id) DO UPDATE SET rating = excluded.rating
`);
const setFavoriteMovieStmt = db.prepare('UPDATE users SET favorite_movie_id = ? WHERE id = ?');
const setFavoriteSeriesStmt = db.prepare('UPDATE users SET favorite_series_id = ? WHERE id = ?');

// Converte a linha crua do banco pro formato que o front espera — nunca
// inclui password_hash, e a idade é sempre computada na hora a partir da
// data de nascimento (não fica desatualizada com o tempo, ver services/age.js).
function rowToProfile(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    accountType: row.account_type,
    birthDate: row.birth_date,
    age: calculateAge(row.birth_date),
    gender: row.gender,
    country: row.country,
    preferredType: row.preferred_type,
    favoriteGenres: JSON.parse(row.favorite_genres || '[]'),
    likedMovieIds: JSON.parse(row.liked_movie_ids || '[]'),
    favoriteMovieId: row.favorite_movie_id,
    favoriteSeriesId: row.favorite_series_id,
    createdAt: row.created_at,
  };
}

function isUniqueEmailError(e) {
  return String(e.message).includes('UNIQUE constraint failed: users.email');
}

// Um único endpoint atende os dois fluxos pedidos: "criar uma conta"
// (informando email + senha) ou apenas "informar dados" (perfil anônimo,
// sem credenciais — o token guarda só o id do perfil).
router.post('/register', accountLimiter, async (req, res) => {
  try {
    const {
      name, email, password, birthDate, gender, country, preferredType, favoriteGenres, likedMovieIds,
    } = req.body;
    const age = calculateAge(birthDate);

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    if (email && !password) {
      return res.status(400).json({ error: 'Informe uma senha para criar conta com e-mail' });
    }
    if (email && password) {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
    }

    const likedMovies = (likedMovieIds || [])
      .map((id) => movies.find((m) => m.id === id))
      .filter(Boolean);

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    try {
      insertUserStmt.run({
        id,
        name: String(name).trim(),
        email: email || null,
        passwordHash: email && password ? await hashPassword(password) : null,
        accountType: email && password ? 'account' : 'guest',
        birthDate: birthDate || null,
        gender: gender || null,
        // Guardado como dado demográfico (ainda não entra no vetor de
        // recomendação — o catálogo não tem país de origem por título;
        // ver comentário em vectorizer.js).
        country: country || null,
        preferredType: preferredType || 'ambos',
        favoriteGenres: JSON.stringify(favoriteGenres || []),
        likedMovieIds: JSON.stringify(likedMovieIds || []),
        createdAt,
      });
    } catch (e) {
      // Constraint UNIQUE de verdade no banco — ao contrário do "busca
      // primeiro, cria depois" de antes (que tinha uma race condition real:
      // duas requisições simultâneas com o mesmo e-mail podiam passar as
      // duas pela checagem), aqui é o próprio SQLite que garante isso.
      if (isUniqueEmailError(e)) return res.status(409).json({ error: 'E-mail já cadastrado' });
      throw e;
    }

    // Os títulos marcados como "já curtiu algum destes?" viram feedback
    // coletivo: além de moldar as recomendações deste usuário (o vetor é
    // recalculado na hora a partir do perfil, ver routes/recommendations.js),
    // passam a valer como sinal pra recomendação de OUTROS usuários com
    // perfil parecido. É uma escolha binária no formulário (chip "curtiu"),
    // sem estrelas — grava como nota 9 (forte positivo), na mesma escala
    // 0-10 usada pelo botão de avaliação do card.
    const IMPLICIT_LIKE_RATING = 9;
    likedMovies.forEach((movie) => {
      upsertFeedbackStmt.run({
        id: `${id}:${movie.id}`,
        movieId: movie.id,
        userId: id,
        rating: IMPLICIT_LIKE_RATING,
        age,
        gender: gender || null,
        country: country || null,
        createdAt,
      });
    });

    const token = signToken({ id });
    res.status(201).json({ token, profile: rowToProfile(findByIdStmt.get(id)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }
    const row = findByEmailStmt.get(email);
    if (!row || !row.password_hash) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const ok = await comparePassword(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = signToken({ id: row.id });
    res.json({ token, profile: rowToProfile(row) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  const row = findByIdStmt.get(req.userId);
  if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ profile: rowToProfile(row) });
});

// Editar os dados do cadastro — e, se o perfil ainda for "só informar
// dados" (accountType 'guest'), também dá pra virar conta de verdade aqui
// (adicionando e-mail/senha), sem perder o perfil já construído (gêneros
// favoritos, títulos curtidos etc). O mesmo token continua valendo depois
// (ele só guarda o id, que não muda).
router.put('/me', requireAuth, accountLimiter, async (req, res) => {
  try {
    const current = findByIdStmt.get(req.userId);
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado' });

    const {
      name, birthDate, gender, country, preferredType, favoriteGenres, email, password,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    let accountType = current.account_type;
    let passwordHash = current.password_hash;
    let finalEmail = current.email;

    // Editar e-mail/senha de uma conta já existente fica fora de escopo por
    // enquanto — só permite "virar conta" quem ainda não tinha uma.
    if (current.account_type !== 'account' && email && password) {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      finalEmail = email;
      accountType = 'account';
      passwordHash = await hashPassword(password);
    }

    try {
      updateUserStmt.run({
        id: req.userId,
        name: String(name).trim(),
        birthDate: birthDate || null,
        gender: gender || null,
        country: country || null,
        preferredType: preferredType || 'ambos',
        favoriteGenres: JSON.stringify(favoriteGenres || []),
        email: finalEmail,
        accountType,
        passwordHash,
      });
    } catch (e) {
      if (isUniqueEmailError(e)) return res.status(409).json({ error: 'E-mail já cadastrado' });
      throw e;
    }

    res.json({ profile: rowToProfile(findByIdStmt.get(req.userId)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Um filme favorito e uma série favorita por perfil (não uma lista — é
// "o" favorito de cada tipo, então marcar um novo troca o anterior).
// Clicar de novo no que já é favorito desfaz. Não exige conta (é só
// personalização de perfil, não um sinal usado no feedback coletivo).
router.post('/favorite', requireAuth, writeLimiter, (req, res) => {
  try {
    const { movieId } = req.body;
    const movie = movies.find((m) => m.id === movieId);
    if (!movie) return res.status(404).json({ error: 'Título não encontrado' });

    const current = findByIdStmt.get(req.userId);
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (movie.type === 'serie') {
      setFavoriteSeriesStmt.run(current.favorite_series_id === movieId ? null : movieId, req.userId);
    } else {
      setFavoriteMovieStmt.run(current.favorite_movie_id === movieId ? null : movieId, req.userId);
    }

    res.json({ profile: rowToProfile(findByIdStmt.get(req.userId)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao favoritar' });
  }
});

module.exports = router;
