const express = require('express');
const movies = require('../data/movies');
const { db } = require('../db/sqlite');

const router = express.Router();

const MAX_LIMIT = 50;
const rankFavoriteMoviesStmt = db.prepare(`
  SELECT favorite_movie_id AS movie_id, COUNT(*) AS favorite_count FROM users
  WHERE favorite_movie_id IS NOT NULL
  GROUP BY favorite_movie_id ORDER BY favorite_count DESC LIMIT ?
`);
const rankFavoriteSeriesStmt = db.prepare(`
  SELECT favorite_series_id AS movie_id, COUNT(*) AS favorite_count FROM users
  WHERE favorite_series_id IS NOT NULL
  GROUP BY favorite_series_id ORDER BY favorite_count DESC LIMIT ?
`);

// Ranking dos favoritos: quantos perfis marcaram cada título como seu
// filme/série favorito (POST /api/auth/favorite). Antes era um scroll na
// coleção inteira do Qdrant contado em memória — agora é uma agregação SQL
// (GROUP BY + índice), o jeito certo de fazer essa conta.
router.get('/favorites', (req, res) => {
  try {
    const { type = 'filme', limit = 10 } = req.query;
    const n = Math.min(Number(limit) || 10, MAX_LIMIT);
    const stmt = type === 'serie' ? rankFavoriteSeriesStmt : rankFavoriteMoviesStmt;

    const items = stmt.all(n)
      .map((r) => {
        const movie = movies.find((m) => m.id === r.movie_id);
        return movie ? { ...movie, favoriteCount: r.favorite_count } : null;
      })
      .filter(Boolean);

    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar ranking de favoritos' });
  }
});

module.exports = router;
