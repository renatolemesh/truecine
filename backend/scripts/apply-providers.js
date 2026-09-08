#!/usr/bin/env node
// Aplica os resultados de providers.progress.jsonl (gerado por
// fetch-providers.js) em src/data/providers.json — um snapshot separado de
// movies.json (não misturado no dataset principal porque essa informação
// fica velha rápido e é usada só como filtro do catálogo; a ficha de cada
// filme busca "onde assistir" ao vivo, ver services/tmdb.js).
//
// Formato de saída: { [movieId]: string[] } — só os nomes dos serviços de
// streaming por assinatura (flatrate). Junto, um índice
// providers-catalog.json com { name, logo } de cada serviço visto, pro
// filtro mostrar o logo.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROGRESS_PATH = path.join(__dirname, 'providers.progress.jsonl');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'providers.json');
const CATALOG_OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'providers-catalog.json');

async function main() {
  const byMovie = {};
  const catalog = new Map(); // name -> logo path

  const rl = readline.createInterface({ input: fs.createReadStream(PROGRESS_PATH), crlfDelay: Infinity });
  let withStreaming = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const { id, flatrate } = JSON.parse(line);
      if (flatrate && flatrate.length) {
        byMovie[id] = flatrate.map((p) => p.name);
        withStreaming += 1;
        flatrate.forEach((p) => { if (!catalog.has(p.name)) catalog.set(p.name, p.logo); });
      }
    } catch { /* linha corrompida, ignora */ }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(byMovie, null, 2));
  const catalogArray = [...catalog.entries()]
    .map(([name, logo]) => ({ name, logo: logo ? `https://image.tmdb.org/t/p/w92${logo}` : null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(CATALOG_OUT_PATH, JSON.stringify(catalogArray, null, 2));

  console.log(`OK: ${withStreaming} títulos com streaming, ${catalogArray.length} serviços distintos.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
