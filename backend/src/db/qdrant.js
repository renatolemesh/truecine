const { QdrantClient } = require('@qdrant/js-client-rest');
const config = require('../config');
const movies = require('../data/movies');
const { buildMovieVector, VECTOR_SIZE } = require('../services/vectorizer');

const client = new QdrantClient({ url: config.QDRANT_URL });

async function waitForQdrant(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i += 1) {
    try {
      await client.getCollections();
      return;
    } catch (e) {
      console.log(`Qdrant ainda não respondeu (tentativa ${i + 1}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Qdrant não respondeu a tempo.');
}

// Só o catálogo mora aqui — é o único dado que de fato usa busca por
// similaridade (recomendações e "títulos parecidos"). Perfis, avaliações e
// comentários viraram tabelas SQLite (ver db/sqlite.js) — eram guardados
// aqui antes, mas nunca usavam `client.search`, só "por id" ou "filtrar por
// campo", ou seja, banco vetorial fazendo papel de banco relacional.
async function ensureCollections() {
  const { collections } = await client.getCollections();
  const names = collections.map((c) => c.name);

  if (!names.includes(config.MOVIES_COLLECTION)) {
    await client.createCollection(config.MOVIES_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    console.log(`Coleção "${config.MOVIES_COLLECTION}" criada.`);
  }
}

const SEED_BATCH_SIZE = 500;

async function seedMoviesIfEmpty() {
  const info = await client.getCollection(config.MOVIES_COLLECTION);
  if (info.points_count === movies.length) {
    console.log(`Catálogo já populado (${info.points_count} títulos).`);
    return;
  }

  // Se o número de pontos não bate com o catálogo atual (primeira vez, ou o
  // catálogo em data/movies.json mudou de tamanho), recria a coleção do
  // zero para não deixar pontos órfãos de uma versão anterior do dataset.
  if (info.points_count > 0) {
    console.log(`Catálogo desatualizado (${info.points_count} pontos vs ${movies.length} títulos) — recriando coleção...`);
    await client.deleteCollection(config.MOVIES_COLLECTION);
    await client.createCollection(config.MOVIES_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
  }

  const points = movies.map((movie, idx) => ({
    id: idx + 1,
    vector: buildMovieVector(movie),
    payload: movie,
  }));

  for (let i = 0; i < points.length; i += SEED_BATCH_SIZE) {
    const batch = points.slice(i, i + SEED_BATCH_SIZE);
    await client.upsert(config.MOVIES_COLLECTION, { wait: true, points: batch });
    console.log(`Seed: ${Math.min(i + SEED_BATCH_SIZE, points.length)}/${points.length} títulos inseridos...`);
  }
  console.log(`Seed concluído: ${points.length} títulos inseridos em "${config.MOVIES_COLLECTION}".`);
}

module.exports = { client, waitForQdrant, ensureCollections, seedMoviesIfEmpty };
