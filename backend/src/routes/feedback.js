const express = require('express');
const { db } = require('../db/sqlite');
const movies = require('../data/movies');
const { calculateAge } = require('../services/age');
const requireAuth = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const findUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const deleteFeedbackStmt = db.prepare('DELETE FROM feedback WHERE id = ?');
const upsertFeedbackStmt = db.prepare(`
  INSERT INTO feedback (id, movie_id, user_id, rating, age, gender, country, created_at)
  VALUES (@id, @movieId, @userId, @rating, @age, @gender, @country, @createdAt)
  ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, age = excluded.age,
    gender = excluded.gender, country = excluded.country, created_at = excluded.created_at
`);

// Avaliar (ou desfazer a nota) um título já cadastrado (fora do formulário
// de cadastro) — mesmo mecanismo de feedback coletivo usado lá: a linha
// guarda o perfil demográfico de quem avaliou + a nota, pra alimentar
// recomendações de outros usuários parecidos (ver routes/recommendations.js).
// O id (`userId:movieId`) é natural — reavaliar o mesmo título faz UPSERT
// em vez de duplicar linha.
//
// Exige conta de verdade (e-mail + senha), não só o perfil "informar
// dados" — sem e-mail não tem como reconhecer a mesma pessoa entre sessões
// nem impedir que um perfil anônimo novo infle a base de avaliações.
router.post('/', requireAuth, writeLimiter, (req, res) => {
  try {
    const { movieId, rating } = req.body;
    const movie = movies.find((m) => m.id === movieId);
    if (!movie) return res.status(404).json({ error: 'Título não encontrado' });

    const profile = findUserStmt.get(req.userId);
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (profile.account_type !== 'account') {
      return res.status(403).json({ error: 'Crie uma conta (com e-mail e senha) pra avaliar títulos.' });
    }

    const id = `${req.userId}:${movieId}`;
    const score = Math.max(0, Math.min(10, Math.round(Number(rating) || 0)));

    if (score <= 0) {
      deleteFeedbackStmt.run(id);
      return res.json({ ok: true, rating: 0 });
    }

    upsertFeedbackStmt.run({
      id,
      movieId,
      userId: req.userId,
      rating: score,
      age: calculateAge(profile.birth_date),
      gender: profile.gender ?? null,
      country: profile.country ?? null,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true, rating: score });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao salvar feedback' });
  }
});

module.exports = router;
