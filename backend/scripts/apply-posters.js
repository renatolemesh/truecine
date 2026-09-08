#!/usr/bin/env node
// Aplica os resultados de posters.progress.jsonl (gerado por
// fetch-posters.js) em src/data/movies.json, como `posterUrl`.
// Rodar depois que fetch-posters.js tiver processado o catálogo (ou uma
// amostra — os que não tiverem pôster encontrado simplesmente não ganham
// o campo, e o card usa o gradiente como fallback).

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const MOVIES_PATH = path.join(__dirname, '..', 'src', 'data', 'movies.json');
const PROGRESS_PATH = path.join(__dirname, 'posters.progress.jsonl');
const POSTER_SIZE = 'w342';
const IMAGE_BASE = `https://image.tmdb.org/t/p/${POSTER_SIZE}`;

async function main() {
  const results = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(PROGRESS_PATH), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const { id, posterPath } = JSON.parse(line);
      if (posterPath) results.set(id, posterPath);
    } catch { /* ignora linha corrompida */ }
  }
  console.log(`Pôsteres disponíveis: ${results.size}`);

  const movies = JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf8'));
  let applied = 0;
  const updated = movies.map((m) => {
    const posterPath = results.get(m.id);
    if (!posterPath) return m;
    applied += 1;
    return { ...m, posterUrl: `${IMAGE_BASE}${posterPath}` };
  });

  fs.writeFileSync(MOVIES_PATH, JSON.stringify(updated, null, 2));
  console.log(`OK: posterUrl aplicado em ${applied}/${movies.length} títulos.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
