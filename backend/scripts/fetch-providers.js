#!/usr/bin/env node
// Busca em quais serviços de streaming (assinatura) cada título está
// disponível no Brasil, via TMDB (dados de origem: JustWatch), e grava em
// scripts/providers.progress.jsonl.
//
// Por que isso NÃO fica direto em movies.json feito os pôsteres: streaming
// muda toda hora (um filme sai da Netflix e vai pra Max no mês seguinte).
// Isso aqui vira um SNAPSHOT pro filtro "disponível em X" do catálogo —
// útil mas pode ficar levemente desatualizado (por isso reroda esse
// script de vez em quando se quiser atualizar). A ficha de cada filme
// (backend/src/services/tmdb.js) já busca ao vivo, então lá a informação
// é sempre atual — só o FILTRO do catálogo usa esse snapshot.
//
//   TMDB_READ_TOKEN=<seu Read Access Token> node scripts/fetch-providers.js
//
// Resumível igual fetch-posters.js.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const MOVIES_PATH = path.join(__dirname, '..', 'src', 'data', 'movies.json');
const PROGRESS_PATH = path.join(__dirname, 'providers.progress.jsonl');
const TOKEN = process.env.TMDB_READ_TOKEN;
const REGION = 'BR';
const CONCURRENCY = 5;
const REQUEST_STAGGER_MS = 120;

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
      const parsed = JSON.parse(line);
      done.set(parsed.id, parsed);
    } catch { /* linha corrompida, ignora */ }
  }
  return done;
}

let rateLimitHits = 0;

async function tmdbFetch(path_, attempt = 0) {
  const res = await fetch(`https://api.themoviedb.org/3${path_}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  });
  if (res.status === 429) {
    rateLimitHits += 1;
    if (attempt > 5) return null;
    const retryAfter = Number(res.headers.get('retry-after')) || 1;
    await sleep((retryAfter + 0.5) * 1000);
    return tmdbFetch(path_, attempt + 1);
  }
  if (!res.ok) return null;
  return res.json();
}

async function fetchProviders(imdbId, type) {
  const find = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
  if (!find) return null;
  const primary = type === 'serie' ? find.tv_results : find.movie_results;
  const fallback = type === 'serie' ? find.movie_results : find.tv_results;
  const hit = primary?.[0] || fallback?.[0];
  if (!hit) return null;
  const mediaType = primary?.[0] ? (type === 'serie' ? 'tv' : 'movie') : (type === 'serie' ? 'movie' : 'tv');

  const data = await tmdbFetch(`/${mediaType}/${hit.id}/watch/providers`);
  const forRegion = data?.results?.[REGION];
  if (!forRegion?.flatrate?.length) return { flatrate: [] };

  const flatrate = forRegion.flatrate
    .slice().sort((a, b) => a.display_priority - b.display_priority)
    .map((p) => ({ name: p.provider_name, logo: p.logo_path }));
  return { flatrate };
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
  const limit = process.argv[2] ? Number(process.argv[2]) : pending.length;

  let cursor = 0;
  async function worker(workerIndex) {
    await sleep(workerIndex * REQUEST_STAGGER_MS);
    while (cursor < Math.min(pending.length, limit)) {
      const movie = pending[cursor];
      cursor += 1;
      const result = await fetchProviders(movie.imdbId, movie.type);
      if (result?.flatrate?.length) found += 1;
      progressStream.write(`${JSON.stringify({ id: movie.id, flatrate: result?.flatrate || [] })}\n`);
      completed += 1;
      if (completed % 500 === 0 || completed === Math.min(pending.length, limit)) {
        console.log(`${completed}/${Math.min(pending.length, limit)} processados, ${found} com streaming encontrado, ${rateLimitHits} rate limits até agora`);
      }
      await sleep(REQUEST_STAGGER_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  progressStream.end();
  console.log('Busca de provedores concluída.');
}

main().catch((e) => { console.error(e); process.exit(1); });
