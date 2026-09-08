const express = require('express');
const { db } = require('../db/sqlite');
const movies = require('../data/movies');
const requireAuth = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const listWatchedStmt = db.prepare('SELECT movie_id FROM watched WHERE user_id = ?');
const insertWatchedStmt = db.prepare(`
  INSERT INTO watched (id, movie_id, user_id, created_at) VALUES (@id, @movieId, @userId, @createdAt)
  ON CONFLICT(id) DO NOTHING
`);
const deleteWatchedStmt = db.prepare('DELETE FROM watched WHERE id = ?');

// Lista os ids marcados como "já visto" pelo usuário — o front usa isso
// pra juntar com o que já tinha no localStorage ao carregar a sessão (ver
// hooks/useWatched.js), sem apagar o que só existia localmente ainda.
router.get('/', requireAuth, (req, res) => {
  const movieIds = listWatchedStmt.all(req.userId).map((r) => r.movie_id);
  res.json({ movieIds });
});

// Marca ou desmarca — manda o estado final explícito (`watched: true|false`)
// em vez de "alternar", pra não desincronizar com o estado local do front
// (que já é otimista). Não exige conta de verdade (mesmo padrão de
// /auth/favorite e da watchlist) — só precisa de um perfil (guest ou
// conta) pra ter um id pra associar.
router.post('/', requireAuth, writeLimiter, (req, res) => {
  try {
    const { movieId, watched } = req.body;
    const movie = movies.find((m) => m.id === movieId);
    if (!movie) return res.status(404).json({ error: 'Título não encontrado' });

    const id = `${req.userId}:${movieId}`;
    if (watched === false) {
      deleteWatchedStmt.run(id);
      return res.json({ ok: true, watched: false });
    }

    insertWatchedStmt.run({
      id, movieId, userId: req.userId, createdAt: new Date().toISOString(),
    });
    res.json({ ok: true, watched: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao salvar' });
  }
});

module.exports = router;
