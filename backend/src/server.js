require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const { waitForQdrant, ensureCollections, seedMoviesIfEmpty } = require('./db/qdrant');
const { migrate } = require('./db/sqlite');

// Precisa rodar ANTES de importar as rotas: elas preparam suas queries
// (db.prepare) assim que o módulo carrega, então as tabelas já têm que
// existir nesse ponto — não dá pra deixar pra chamar migrate() só dentro
// de start(), depois desses requires.
migrate();

const authRoutes = require('./routes/auth');
const movieRoutes = require('./routes/movies');
const recommendationRoutes = require('./routes/recommendations');
const feedbackRoutes = require('./routes/feedback');
const commentsRoutes = require('./routes/comments');
const providersRoutes = require('./routes/providers');
const extrasRoutes = require('./routes/extras');
const rankingRoutes = require('./routes/ranking');
const watchedRoutes = require('./routes/watched');

const app = express();
// Backend é só API JSON (o HTML/CSS/JS do site é servido pelo nginx do
// frontend, em outro processo) — não precisa da parte de CSP do helmet
// pensada pra quem serve HTML, só dos headers de segurança padrão.
app.use(helmet({ contentSecurityPolicy: false }));
// CORS_ORIGIN não definido = aberto pra qualquer origem (ok pra uso local/
// atrás de um proxy same-origin); definindo, por exemplo
// CORS_ORIGIN=https://seu-dominio.com, restringe de verdade.
app.use(cors(config.CORS_ORIGIN ? { origin: config.CORS_ORIGIN } : {}));
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/movies/:movieId/comments', commentsRoutes);
app.use('/api/movies/:movieId/providers', providersRoutes);
app.use('/api/movies/:movieId/extras', extrasRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/watched', watchedRoutes);

async function start() {
  console.log('Aguardando Qdrant ficar disponível...');
  await waitForQdrant();
  await ensureCollections();
  await seedMoviesIfEmpty();
  app.listen(config.PORT, () => console.log(`API rodando na porta ${config.PORT}`));
}

start().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
