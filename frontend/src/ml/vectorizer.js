// Versão client-side de buildMovieVector (backend/src/services/vectorizer.js).
// Só a parte do FILME precisa ser duplicada aqui: o vetor de PREFERÊNCIA do
// usuário já vem pronto do backend (`userVector`, calculado uma única vez
// no cadastro e guardado no Qdrant), então não há necessidade de reimplementar
// buildUserVector no navegador. Se mudar a lógica de vetorização de filmes no
// backend, replique a mudança aqui também.
//
// A lista de gêneros também vem do backend (`GET /api/movies/genres`) em vez
// de ficar hardcoded duas vezes — assim a posição de cada gênero no vetor
// nunca desalinha entre as duas pontas.

const YEAR_MIN = 1950;
const YEAR_MAX = 2026;

const MATURITY_TO_VALUE = {
  G: 0.1,
  PG: 0.3,
  'PG-13': 0.5,
  R: 0.8,
};

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function vectorSize(genres) {
  return genres.length + 4;
}

export function buildMovieVector(movie, genres) {
  const rawGenreVector = genres.map((g) => (movie.genres.includes(g) ? 1 : 0));
  const genreTotal = rawGenreVector.reduce((a, b) => a + b, 0) || 1;
  const genreVector = rawGenreVector.map((v) => v / genreTotal);

  const yearNorm = clamp01((movie.year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN));
  const ratingNorm = clamp01(movie.rating / 10);
  const typeVal = movie.type === 'serie' ? 1 : 0;
  const maturityVal = MATURITY_TO_VALUE[movie.maturity] ?? 0.5;

  return [...genreVector, yearNorm, ratingNorm, typeVal, maturityVal];
}
