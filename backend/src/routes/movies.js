const express = require('express');
const rawMovies = require('../data/movies');
const genres = require('../data/genres');
const providersByMovie = require('../data/providers.json');
const providersCatalog = require('../data/providers-catalog.json');
const { client } = require('../db/qdrant');
const config = require('../config');
const { buildMovieVector } = require('../services/vectorizer');

const router = express.Router();

// Catálogo ordenado por popularidade (nº de votos no IMDb) uma única vez,
// na carga do módulo — com ~19 mil títulos, ordenar a cada request seria
// desperdício. É essa ordem (e esse array) que serve de base pros outros
// modos de ordenação abaixo.
const movies = [...rawMovies].sort((a, b) => (b.votes || 0) - (a.votes || 0));

// "Ordenar por nota" pura deixaria títulos com pouquíssimos votos (ou
// nenhum — vários vieram só do Kaggle, sem imdbId pra casar com o IMDb
// oficial) dominarem o topo: um vídeo infantil com 3 votos "10/10" não é
// de fato "melhor" que Um Sonho de Liberdade com 3 milhões de votos.
// Mesma correção que o próprio IMDb usa no Top 250: nota ponderada puxando
// os títulos com poucos votos em direção à média geral do catálogo.
const MIN_VOTES_FOR_RATING = 5000;
const meanRating = movies.reduce((sum, m) => sum + m.rating, 0) / movies.length;
function weightedRating(m) {
  const v = m.votes || 0;
  return (v / (v + MIN_VOTES_FOR_RATING)) * m.rating + (MIN_VOTES_FOR_RATING / (v + MIN_VOTES_FOR_RATING)) * meanRating;
}

const SORTERS = {
  popularity: (a, b) => (b.votes || 0) - (a.votes || 0),
  rating: (a, b) => weightedRating(b) - weightedRating(a),
  year_desc: (a, b) => b.year - a.year,
  year_asc: (a, b) => a.year - b.year,
  // Séries não têm duração (têm temporadas) — ficam sempre por último,
  // independente da direção da ordenação.
  runtime_desc: (a, b) => (b.runtimeMinutes ?? -1) - (a.runtimeMinutes ?? -1),
  runtime_asc: (a, b) => (a.runtimeMinutes ?? Infinity) - (b.runtimeMinutes ?? Infinity),
};

// Amostra aleatória sem reposição (Fisher-Yates parcial) — usada tanto
// pelo "sortear" quanto (em outro arquivo) pelas recomendações.
function sampleRandom(pool, n) {
  const copy = [...pool];
  const picked = [];
  for (let i = 0; i < n && copy.length; i += 1) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy[idx]);
    copy[idx] = copy[copy.length - 1];
    copy.pop();
  }
  return picked;
}

// O catálogo em si (o que aparece na home) não precisa de busca vetorial —
// é só uma listagem/filtro simples. O Qdrant entra em cena nas recomendações.
router.get('/genres', (req, res) => {
  res.json({ genres });
});

// Serviços de streaming disponíveis pro filtro "disponível em" — vem do
// snapshot gerado por scripts/fetch-providers.js (ver comentário lá sobre
// por que isso não é buscado ao vivo pro catálogo inteiro).
router.get('/providers', (req, res) => {
  res.json({ providers: providersCatalog });
});

router.get('/', (req, res) => {
  const {
    type, search, page = 1, pageSize = 24, sort, minRating, maxRating, yearMin, yearMax, excludeIds, random, count,
    provider,
  } = req.query;

  // Aceita tanto ?genre=Ação (um só) quanto ?genre=Ação&genre=Terror
  // (multiseleção) — nesse caso o filtro é "E" (precisa ter todos).
  const genreList = Array.isArray(req.query.genre)
    ? req.query.genre
    : (req.query.genre ? [req.query.genre] : []);

  const excludeSet = new Set((excludeIds || '').split(',').map((s) => s.trim()).filter(Boolean));

  let items = movies;

  if (type) items = items.filter((m) => m.type === type);
  if (genreList.length) items = items.filter((m) => genreList.every((g) => m.genres.includes(g)));
  if (provider) items = items.filter((m) => (providersByMovie[m.id] || []).includes(provider));
  if (minRating) items = items.filter((m) => m.rating >= Number(minRating));
  if (maxRating) items = items.filter((m) => m.rating <= Number(maxRating));
  if (yearMin) items = items.filter((m) => m.year >= Number(yearMin));
  if (yearMax) items = items.filter((m) => m.year <= Number(yearMax));
  if (excludeSet.size) items = items.filter((m) => !excludeSet.has(m.id));
  if (search) {
    // `title` é o nome exibido (traduzido pra PT-BR quando existe aka
    // oficial) e `originalTitle` só existe quando esse título diverge do
    // original em inglês — busca em ambos pra funcionar digitando em
    // qualquer um dos dois idiomas (ex.: "shawshank" ou "sonho de liberdade").
    const s = String(search).toLowerCase();
    items = items.filter((m) => m.title.toLowerCase().includes(s)
      || (m.originalTitle && m.originalTitle.toLowerCase().includes(s)));
  }

  // Modo "sortear": ignora ordenação/paginação, devolve N itens aleatórios
  // dentre os que passaram nos mesmos filtros (tipo/gênero/nota/ano/busca).
  if (random === 'true') {
    const n = Math.min(Math.max(Number(count) || 1, 1), 20);
    return res.json({ items: sampleRandom(items, n), total: items.length });
  }

  if (sort && sort !== 'popularity' && SORTERS[sort]) {
    items = [...items].sort(SORTERS[sort]);
  }

  const limit = Number(pageSize) || 24;
  const start = (Number(page) - 1) * limit;
  const paged = items.slice(start, start + limit);

  res.json({ items: paged, total: items.length });
});

// "Títulos parecidos": reaproveita o vetor de conteúdo do próprio filme
// (gêneros + ano + nota + tipo + classificação) como consulta no Qdrant —
// mesmo mecanismo das recomendações, só que a partir de um filme em vez do
// perfil do usuário. Não precisa buscar o ponto no Qdrant pra pegar o
// vetor: recalcular na hora é barato e evita mais uma viagem ao banco.
router.get('/:id/similar', async (req, res) => {
  const movie = movies.find((m) => m.id === req.params.id);
  if (!movie) return res.status(404).json({ error: 'Título não encontrado' });
  try {
    const vector = buildMovieVector(movie);
    const results = await client.search(config.MOVIES_COLLECTION, {
      vector,
      limit: 13, // +1 pro próprio filme, que sempre vem primeiro (similaridade 1.0) e é descartado
      with_payload: true,
    });
    const items = results
      .map((r) => r.payload)
      .filter((m) => m.id !== movie.id)
      .slice(0, 12);
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar títulos parecidos' });
  }
});

router.get('/:id', (req, res) => {
  const movie = movies.find((m) => m.id === req.params.id);
  if (!movie) return res.status(404).json({ error: 'Título não encontrado' });
  res.json({ item: movie });
});

module.exports = router;
