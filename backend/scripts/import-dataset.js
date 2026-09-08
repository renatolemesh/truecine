#!/usr/bin/env node
// Gera src/data/movies.json combinando duas fontes públicas:
//
//  1) Netflix TV Shows and Movies (mirror do Kaggle, sem precisar de login):
//     https://github.com/amirtds/kaggle-netflix-tv-shows-and-movies/blob/main/titles.csv
//     Tem sinopse, mas cobre só o catálogo histórico da Netflix (~5,7 mil títulos).
//
//  2) Datasets oficiais e não-comerciais do IMDb:
//     https://datasets.imdbws.com/title.basics.tsv.gz
//     https://datasets.imdbws.com/title.ratings.tsv.gz
//     https://datasets.imdbws.com/title.akas.tsv.gz
//     Cobre filmes/séries em geral (usamos um corte de popularidade — ver
//     MIN_VOTES abaixo), mas NÃO tem sinopse. title.akas.tsv.gz traz título
//     alternativo por região — usamos a região BR para exibir o nome como é
//     conhecido no Brasil (ex.: "The Shawshank Redemption" -> "Um Sonho de
//     Liberdade"), guardando o original em `originalTitle`. Quando não há
//     título BR distinto (ex.: "Breaking Bad", que não é traduzido aqui),
//     o título original é mantido sem alteração.
//     Uso sujeito aos termos não-comerciais do IMDb: https://www.imdb.com/interfaces/
//
// O merge: título do Kaggle com imdb_id conhecido -> nota/votos são
// atualizados com o valor oficial do IMDb e os gêneros são unidos; títulos
// do IMDb sem correspondência no Kaggle entram no catálogo sem sinopse
// (fica um texto padrão no lugar). Isso NUNCA roda em tempo de execução do
// backend — o resultado já fica versionado em src/data/movies.json. Para
// atualizar o catálogo, rode `node scripts/import-dataset.js` de novo
// (baixa ~230MB do IMDb + ~2MB do Kaggle e leva alguns minutos).

const fs = require('fs');
const zlib = require('zlib');
const https = require('https');
const readline = require('readline');
const path = require('path');

const KAGGLE_URL = 'https://raw.githubusercontent.com/amirtds/kaggle-netflix-tv-shows-and-movies/main/titles.csv';
const IMDB_BASICS_URL = 'https://datasets.imdbws.com/title.basics.tsv.gz';
const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';
const IMDB_AKAS_URL = 'https://datasets.imdbws.com/title.akas.tsv.gz';
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'movies.json');

// Só entram títulos do IMDb com pelo menos esse número de votos — sem esse
// corte o dataset oficial tem mais de 1 milhão de linhas depois de filtrar
// por tipo. 10.000 mantém ~19 mil títulos conhecidos.
const MIN_IMDB_VOTES = 10000;

const KAGGLE_GENRE_MAP = {
  action: 'Ação', animation: 'Animação', comedy: 'Comédia', crime: 'Crime',
  documentation: 'Documentário', drama: 'Drama', family: 'Família', fantasy: 'Fantasia',
  history: 'História', horror: 'Terror', music: 'Música', reality: 'Reality',
  romance: 'Romance', scifi: 'Ficção Científica', sport: 'Esporte', thriller: 'Suspense',
  war: 'Guerra', western: 'Faroeste',
  // 'european' é uma tag regional do dataset de origem, não um gênero — sem mapeamento.
};

const IMDB_GENRE_MAP = {
  Action: 'Ação', Adventure: 'Aventura', Animation: 'Animação', Biography: 'Documentário',
  Comedy: 'Comédia', Crime: 'Crime', Documentary: 'Documentário', Drama: 'Drama',
  Family: 'Família', Fantasy: 'Fantasia', 'Film-Noir': 'Suspense', 'Game-Show': 'Reality',
  History: 'História', Horror: 'Terror', Music: 'Música', Musical: 'Música',
  Mystery: 'Mistério', News: 'Reality', 'Reality-TV': 'Reality', Romance: 'Romance',
  'Sci-Fi': 'Ficção Científica', Sport: 'Esporte', 'Talk-Show': 'Reality', Thriller: 'Suspense',
  War: 'Guerra', Western: 'Faroeste',
  // Short / Adult: sem mapeamento.
};

const MATURITY_MAP = {
  'TV-Y': 'G', 'TV-G': 'G', G: 'G', 'TV-Y7': 'PG', PG: 'PG', 'TV-PG': 'PG',
  'PG-13': 'PG-13', 'TV-14': 'PG-13', R: 'R', 'TV-MA': 'R', 'NC-17': 'R',
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`)); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false; } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c === '\r') { /* ignora */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function loadKaggle() {
  console.log(`Baixando ${KAGGLE_URL} ...`);
  const csv = await fetchText(KAGGLE_URL);
  const rows = parseCSV(csv);
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = [];
  const seenIds = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r || r.length < header.length) continue;
    const id = r[idx.id];
    const title = (r[idx.title] || '').trim();
    const typeRaw = r[idx.type];
    const year = parseInt(r[idx.release_year], 10);
    const imdbScore = parseFloat(r[idx.imdb_score]);
    const tmdbScore = parseFloat(r[idx.tmdb_score]);
    const imdbVotes = parseInt(r[idx.imdb_votes], 10);
    const imdbId = r[idx.imdb_id];
    const ageCert = r[idx.age_certification];
    const runtime = parseInt(r[idx.runtime], 10);
    const seasons = parseInt(r[idx.seasons], 10);
    const description = (r[idx.description] || '').trim().slice(0, 600);

    if (!id || seenIds.has(id) || !title || !year || Number.isNaN(year)) continue;
    const genres = [...new Set((r[idx.genres] || '').replace(/[[\]']/g, '').split(',')
      .map((g) => g.trim()).filter(Boolean).map((g) => KAGGLE_GENRE_MAP[g]).filter(Boolean))];
    if (genres.length === 0) continue;
    const rating = !Number.isNaN(imdbScore) ? imdbScore : (!Number.isNaN(tmdbScore) ? tmdbScore : null);
    if (rating === null) continue;

    seenIds.add(id);
    out.push({
      id,
      title,
      year,
      type: typeRaw === 'SHOW' ? 'serie' : 'filme',
      genres,
      rating: Math.round(rating * 10) / 10,
      votes: !Number.isNaN(imdbVotes) ? imdbVotes : null,
      maturity: MATURITY_MAP[ageCert] || 'PG-13',
      overview: description || null,
      runtimeMinutes: !Number.isNaN(runtime) && runtime > 0 ? runtime : null,
      seasons: typeRaw === 'SHOW' && !Number.isNaN(seasons) && seasons > 0 ? seasons : null,
      imdbId: imdbId && imdbId.startsWith('tt') ? imdbId : null,
    });
  }
  console.log(`Kaggle: ${out.length} títulos válidos.`);
  return out;
}

// Baixa um .gz remoto para um stream de linhas, sem gravar em disco.
function gunzipLines(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        gunzipLines(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`)); return; }
      const rl = readline.createInterface({ input: res.pipe(zlib.createGunzip()), crlfDelay: Infinity });
      resolve(rl);
    }).on('error', reject);
  });
}

async function loadImdb() {
  console.log(`Baixando ${IMDB_RATINGS_URL} ...`);
  const ratingsMap = new Map();
  const ratingsRl = await gunzipLines(IMDB_RATINGS_URL);
  let first = true;
  for await (const line of ratingsRl) {
    if (first) { first = false; continue; }
    const [tconst, averageRating, numVotes] = line.split('\t');
    ratingsMap.set(tconst, { rating: parseFloat(averageRating), votes: parseInt(numVotes, 10) });
  }
  console.log(`IMDb ratings: ${ratingsMap.size} linhas.`);

  console.log(`Baixando ${IMDB_BASICS_URL} (~230MB, streaming) ...`);
  const basicsRl = await gunzipLines(IMDB_BASICS_URL);
  const out = [];
  first = true;
  for await (const line of basicsRl) {
    if (first) { first = false; continue; }
    const [tconst, titleType, primaryTitle, , isAdult, startYear, , runtimeMinutes, genresRaw] = line.split('\t');
    if (!['movie', 'tvSeries', 'tvMiniSeries'].includes(titleType)) continue;
    if (isAdult === '1') continue;
    const r = ratingsMap.get(tconst);
    if (!r || Number.isNaN(r.votes) || r.votes < MIN_IMDB_VOTES) continue;
    const year = parseInt(startYear, 10);
    if (!year || Number.isNaN(year)) continue;
    const genres = [...new Set((genresRaw || '').split(',').map((g) => g.trim())
      .filter((g) => g && g !== '\\N').map((g) => IMDB_GENRE_MAP[g]).filter(Boolean))];
    if (genres.length === 0) continue;

    out.push({
      id: tconst,
      title: primaryTitle,
      year,
      type: titleType === 'movie' ? 'filme' : 'serie',
      genres,
      rating: Math.round(r.rating * 10) / 10,
      votes: r.votes,
      runtimeMinutes: runtimeMinutes && runtimeMinutes !== '\\N' ? parseInt(runtimeMinutes, 10) : null,
    });
  }
  console.log(`IMDb: ${out.length} títulos com >= ${MIN_IMDB_VOTES} votos.`);
  return out;
}

function merge(kaggle, imdb) {
  const imdbById = new Map(imdb.map((m) => [m.id, m]));
  const final = new Map();
  const usedImdbIds = new Set();

  for (const m of kaggle) {
    const key = m.imdbId || m.id;
    const { imdbId, ...rest } = m;
    final.set(key, { ...rest, id: key, imdbId: imdbId || null, source: 'kaggle' });
    if (imdbId) usedImdbIds.add(imdbId);
  }

  for (const movie of final.values()) {
    if (!movie.imdbId) continue;
    const official = imdbById.get(movie.imdbId);
    if (!official) continue;
    movie.rating = official.rating;
    movie.votes = official.votes;
    movie.genres = [...new Set([...movie.genres, ...official.genres])];
    movie.runtimeMinutes = movie.runtimeMinutes || official.runtimeMinutes;
    movie.source = 'kaggle+imdb';
  }

  for (const m of imdb) {
    if (usedImdbIds.has(m.id)) continue;
    final.set(m.id, {
      id: m.id,
      title: m.title,
      year: m.year,
      type: m.type,
      genres: m.genres,
      rating: m.rating,
      votes: m.votes,
      maturity: 'PG-13', // dataset oficial do IMDb não traz classificação indicativa
      overview: null,
      runtimeMinutes: m.runtimeMinutes,
      seasons: null,
      imdbId: m.id,
      source: 'imdb',
    });
  }

  return [...final.values()].map((m) => ({
    ...m,
    overview: m.overview || 'Sinopse não disponível para este título.',
  }));
}

// Aplica o título como é conhecido no Brasil (title.akas.tsv.gz, region=BR)
// por cima do catálogo já mesclado. É um arquivo grande (todas as regiões,
// ~500MB comprimido) — filtramos por região e por imdbId já presente no
// catálogo enquanto lemos, então a memória usada fica pequena.
async function applyBrazilianTitles(movies) {
  const wanted = new Set(movies.filter((m) => m.imdbId).map((m) => m.imdbId));
  console.log(`Baixando ${IMDB_AKAS_URL} (~500MB, streaming) ...`);
  const rl = await gunzipLines(IMDB_AKAS_URL);
  const brTitles = new Map(); // imdbId -> { title, type }
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const [titleId, , title, region, , types] = line.split('\t');
    if (region !== 'BR' || !wanted.has(titleId)) continue;
    const isDisplay = (types || '').includes('imdbDisplay');
    const current = brTitles.get(titleId);
    if (!current || (isDisplay && current.type !== 'imdbDisplay')) {
      brTitles.set(titleId, { title, type: isDisplay ? 'imdbDisplay' : (types || 'other') });
    }
  }
  console.log(`IMDb akas: ${brTitles.size} títulos com nome BR encontrado.`);

  let applied = 0;
  const updated = movies.map((m) => {
    if (!m.imdbId) return m;
    const br = brTitles.get(m.imdbId);
    if (!br || br.title === m.title) return m;
    applied += 1;
    return { ...m, originalTitle: m.title, title: br.title };
  });
  console.log(`Títulos ajustados para o nome usado no Brasil: ${applied}.`);
  return updated;
}

async function main() {
  const kaggle = await loadKaggle();
  const imdb = await loadImdb();
  const merged = merge(kaggle, imdb);
  const movies = await applyBrazilianTitles(merged);
  fs.writeFileSync(OUT_PATH, JSON.stringify(movies, null, 2));
  console.log(`OK: ${movies.length} títulos gravados em ${OUT_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
