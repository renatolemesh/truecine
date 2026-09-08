// "Onde assistir", trailer e elenco — tudo isso NÃO entra no dataset
// estático (movies.json) como os pôsteres: onde assistir muda toda hora, e
// trailer/elenco não valem os ~19 mil x 2 requests extras de um fetch em
// massa quando só uma fração dos títulos chega a ter a ficha aberta. É
// buscado ao vivo no TMDB toda vez que alguém abre a ficha de um título,
// com um cache curto em memória só pra não bater na API de novo a cada
// clique no mesmo filme.
const config = require('../config');

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const providersCache = new Map(); // `${imdbId}:${region}` -> { expiresAt, data }
const extrasCache = new Map(); // imdbId -> { expiresAt, data }
const targetCache = new Map(); // imdbId -> { expiresAt, target } — find/{imdbId} é usado tanto por providers quanto por extras

async function tmdbFetch(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${config.TMDB_READ_TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function findTmdbTarget(imdbId) {
  const cached = targetCache.get(imdbId);
  if (cached && cached.expiresAt > Date.now()) return cached.target;

  const data = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
  let target = null;
  if (data) {
    const movie = data.movie_results?.[0];
    const tv = data.tv_results?.[0];
    target = movie ? { tmdbId: movie.id, mediaType: 'movie' } : (tv ? { tmdbId: tv.id, mediaType: 'tv' } : null);
  }
  targetCache.set(imdbId, { expiresAt: Date.now() + TTL_MS, target });
  return target;
}

function mapProviders(list) {
  return (list || [])
    .slice().sort((a, b) => a.display_priority - b.display_priority)
    .map((p) => ({
      name: p.provider_name,
      logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
    }));
}

// Devolve { region, link, flatrate, rent, buy } ou null (título sem
// imdbId, não encontrado no TMDB, ou sem nenhuma oferta na região).
async function getWatchProviders(imdbId, region) {
  if (!config.TMDB_READ_TOKEN || !imdbId) return null;

  const cacheKey = `${imdbId}:${region}`;
  const cached = providersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const target = await findTmdbTarget(imdbId);
  if (!target) return null;

  const data = await tmdbFetch(`/${target.mediaType}/${target.tmdbId}/watch/providers`);
  const forRegion = data?.results?.[region];

  const result = forRegion ? {
    region,
    link: forRegion.link,
    flatrate: mapProviders(forRegion.flatrate),
    rent: mapProviders(forRegion.rent),
    buy: mapProviders(forRegion.buy),
  } : null;

  providersCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, data: result });
  return result;
}

// Devolve { trailerKey, cast, director } ou null.
async function getExtras(imdbId) {
  if (!config.TMDB_READ_TOKEN || !imdbId) return null;

  const cached = extrasCache.get(imdbId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const target = await findTmdbTarget(imdbId);
  if (!target) return null;

  const [videos, credits] = await Promise.all([
    tmdbFetch(`/${target.mediaType}/${target.tmdbId}/videos`),
    tmdbFetch(`/${target.mediaType}/${target.tmdbId}/credits`),
  ]);

  const trailer = (videos?.results || []).find((v) => v.site === 'YouTube' && v.type === 'Trailer')
    || (videos?.results || []).find((v) => v.site === 'YouTube');

  const cast = (credits?.cast || []).slice(0, 8).map((p) => ({
    name: p.name,
    character: p.character,
    photo: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null,
  }));

  const directorJobs = ['Director', 'Series Director'];
  const director = (credits?.crew || []).find((p) => directorJobs.includes(p.job))?.name || null;

  const data = { trailerKey: trailer?.key || null, cast, director };
  extrasCache.set(imdbId, { expiresAt: Date.now() + TTL_MS, data });
  return data;
}

module.exports = { getWatchProviders, getExtras };
