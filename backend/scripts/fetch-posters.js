#!/usr/bin/env node
// Busca a URL do pôster de cada título no TMDB (via imdbId, usando o
// endpoint /find) e grava em src/data/movies.json como `posterUrl`.
//
// Exige uma API key do TMDB (gratuita): https://www.themoviedb.org/settings/api
//   TMDB_READ_TOKEN=<seu Read Access Token> node scripts/fetch-posters.js
//
// Resumível: grava cada resultado em posters.progress.jsonl conforme
// processa, então se cair no meio (rate limit, rede etc.) é só rodar de
// novo — os já feitos são pulados. No final, aplica tudo em movies.json e
// (se quiser apagar) o arquivo de progresso pode ser removido.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const MOVIES_PATH = path.join(__dirname, '..', 'src', 'data', 'movies.json');
const PROGRESS_PATH = path.join(__dirname, 'posters.progress.jsonl');
const TOKEN = process.env.TMDB_READ_TOKEN;
// Concorrência baixa de propósito: um valor alto (testamos com 15) dispara
// rate limit no TMDB depois de alguns milhares de requests, e cada 429 gera
// um retry com backoff — o resultado líquido é MAIS lento que ir devagar e
// constante. Com 5 + um pequeno atraso por worker, o throughput fica estável.
const CONCURRENCY = 5;
const REQUEST_STAGGER_MS = 120;
const POSTER_SIZE = 'w342';

if (!TOKEN) {
  console.error('Defina TMDB_READ_TOKEN (Read Access Token do TMDB) antes de rodar.');
  process.exit(1);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function loadProgress() {
  const done = new Map();
  if (!fs.existsSync(PROGRESS_PATH)) return done;
  const rl = readline.createInterface({ input: fs.createReadStream(PROGRESS_PATH), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const { id, posterPath } = JSON.parse(line);
      done.set(id, posterPath);
    } catch { /* linha corrompida, ignora */ }
  }
  return done;
}

let rateLimitHits = 0;

async function fetchPoster(imdbId, type, attempt = 0) {
  const res = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  });
  if (res.status === 429) {
    rateLimitHits += 1;
    if (attempt > 5) return null;
    const retryAfter = Number(res.headers.get('retry-after')) || 1;
    await sleep((retryAfter + 0.5) * 1000);
    return fetchPoster(imdbId, type, attempt + 1);
  }
  if (!res.ok) return null;
  const data = await res.json();
  const primary = type === 'serie' ? data.tv_results : data.movie_results;
  const fallback = type === 'serie' ? data.movie_results : data.tv_results;
  return primary?.[0]?.poster_path || fallback?.[0]?.poster_path || null;
}

async function main() {
  const movies = JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf8'));
  const targets = movies.filter((m) => m.imdbId);
  console.log(`Títulos com imdbId: ${targets.length}`);

  const done = await loadProgress();
  console.log(`Já processados (retomando): ${done.size}`);

  const pending = targets.filter((m) => !done.has(m.id));
  console.log(`Restam: ${pending.length}`);

  const progressStream = fs.createWriteStream(PROGRESS_PATH, { flags: 'a' });
  let completed = 0;
  let found = 0;
  const total = pending.length;
  const limit = process.argv[2] ? Number(process.argv[2]) : total; // permite rodar só uma amostra: node fetch-posters.js 100

  let cursor = 0;
  async function worker(workerIndex) {
    // Espalha o início de cada worker pra não disparar N requests no
    // mesmíssimo instante (isso sozinho já reduz bastante os 429).
    await sleep(workerIndex * REQUEST_STAGGER_MS);
    while (cursor < Math.min(pending.length, limit)) {
      const movie = pending[cursor];
      cursor += 1;
      const posterPath = await fetchPoster(movie.imdbId, movie.type);
      if (posterPath) found += 1;
      progressStream.write(`${JSON.stringify({ id: movie.id, posterPath })}\n`);
      completed += 1;
      if (completed % 250 === 0 || completed === Math.min(pending.length, limit)) {
        console.log(`${completed}/${Math.min(pending.length, limit)} processados, ${found} com pôster encontrado, ${rateLimitHits} rate limits até agora`);
      }
      await sleep(REQUEST_STAGGER_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  progressStream.end();
  console.log('Busca de pôsteres concluída (ou amostra concluída).');
}

main().catch((e) => { console.error(e); process.exit(1); });
