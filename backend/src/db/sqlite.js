// Dados mutáveis de usuário (perfis, avaliações, comentários) moraram no
// Qdrant durante boa parte deste projeto, mas nunca usaram busca por
// similaridade de verdade — só "buscar por id" e "filtrar por campo", ou
// seja, um banco vetorial fazendo papel de banco de documentos. O Qdrant
// continua sendo o lugar certo pro que É vetorial (catálogo de filmes, ver
// db/qdrant.js); o resto vem pra cá.
//
// SQLite (via node:sqlite, nativo do Node — sem dependência externa nem
// compilação) porque dá as garantias que faltavam (UNIQUE de verdade no
// e-mail, chave estrangeira, transação) sem precisar de mais um container:
// pro volume de usuários deste projeto (mesmo que chegue a milhares), um
// arquivo só já dá conta com folga.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

fs.mkdirSync(path.dirname(config.SQLITE_PATH), { recursive: true });

const db = new DatabaseSync(config.SQLITE_PATH);

// WAL: leituras não ficam bloqueadas esperando uma escrita concorrente —
// relevante aqui porque o processo Node é single-threaded, mas o SQLite
// ainda serializa escritas internamente; WAL deixa isso mais suave.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      account_type TEXT NOT NULL DEFAULT 'guest',
      birth_date TEXT,
      gender TEXT,
      country TEXT,
      preferred_type TEXT NOT NULL DEFAULT 'ambos',
      favorite_genres TEXT NOT NULL DEFAULT '[]',
      liked_movie_ids TEXT NOT NULL DEFAULT '[]',
      favorite_movie_id TEXT,
      favorite_series_id TEXT,
      created_at TEXT NOT NULL
    );

    -- "Feedback coletivo": uma linha por (usuário, título) avaliado — o id
    -- natural (user_id:movie_id) evita duplicar linha a cada nova nota
    -- (UPSERT) sem precisar de um hash artificial pra virar chave.
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      movie_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      age INTEGER,
      gender TEXT,
      country TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_movie ON feedback(movie_id);
    -- Cobre a cadeia de filtros de "gente parecida" nas recomendações
    -- (país + faixa etária + nota mínima — ver routes/recommendations.js).
    CREATE INDEX IF NOT EXISTS idx_feedback_cohort ON feedback(country, age, rating);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      movie_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL,
      rating INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_movie ON comments(movie_id, created_at DESC);
  `);
}

module.exports = { db, migrate };
