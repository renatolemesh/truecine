const express = require('express');
const movies = require('../data/movies');
const { getExtras } = require('../services/tmdb');

// { mergeParams: true } pra enxergar :movieId (path montado em server.js).
const router = express.Router({ mergeParams: true });

router.get('/', async (req, res) => {
  const { movieId } = req.params;
  const movie = movies.find((m) => m.id === movieId);
  if (!movie) return res.status(404).json({ error: 'Título não encontrado' });

  try {
    const extras = await getExtras(movie.imdbId);
    res.json({ extras });
  } catch (e) {
    console.error(e);
    // Igual em providers.js: falha ao consultar o TMDB não deveria quebrar
    // a ficha do filme, só não mostra a seção de trailer/elenco.
    res.json({ extras: null });
  }
});

module.exports = router;
