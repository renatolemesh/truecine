const express = require('express');
const movies = require('../data/movies');
const { getWatchProviders } = require('../services/tmdb');

// { mergeParams: true } pra enxergar :movieId (path montado em server.js).
const router = express.Router({ mergeParams: true });

const DEFAULT_REGION = 'BR';
const ALLOWED_REGIONS = ['BR', 'US']; // mesmas opções do seletor de idioma PT/EN — sem input livre indo direto pra API de terceiro

router.get('/', async (req, res) => {
  const { movieId } = req.params;
  const movie = movies.find((m) => m.id === movieId);
  if (!movie) return res.status(404).json({ error: 'Título não encontrado' });

  const region = ALLOWED_REGIONS.includes(req.query.region) ? req.query.region : DEFAULT_REGION;

  try {
    const providers = await getWatchProviders(movie.imdbId, region);
    res.json({ providers });
  } catch (e) {
    console.error(e);
    // Falha ao consultar o TMDB não deveria quebrar a ficha do filme — só
    // não mostra a seção de "onde assistir".
    res.json({ providers: null });
  }
});

module.exports = router;
