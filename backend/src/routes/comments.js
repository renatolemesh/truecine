const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/sqlite');
const movies = require('../data/movies');
const requireAuth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

// { mergeParams: true } pra enxergar :movieId, que vem do path onde este
// router é montado em server.js (/api/movies/:movieId/comments).
const router = express.Router({ mergeParams: true });

const MAX_LENGTH = 2000;

const findUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const findFeedbackRatingStmt = db.prepare('SELECT rating FROM feedback WHERE id = ?');
const listCommentsStmt = db.prepare('SELECT * FROM comments WHERE movie_id = ? ORDER BY created_at DESC LIMIT 200');
const insertCommentStmt = db.prepare(`
  INSERT INTO comments (id, movie_id, user_id, user_name, text, rating, created_at)
  VALUES (@id, @movieId, @userId, @userName, @text, @rating, @createdAt)
`);
const findCommentStmt = db.prepare('SELECT * FROM comments WHERE id = ?');
const deleteCommentStmt = db.prepare('DELETE FROM comments WHERE id = ?');

// Não devolve o `user_id` de quem comentou pra quem lista os comentários —
// é um id real de outra pessoa, sem motivo pra ficar público. O front só
// precisa saber "esse comentário é meu?" pra mostrar o botão de excluir,
// então isso vira `isOwn` (calculado aqui, comparando com o token de quem
// pediu, se houver).
function toPublicComment(row, viewerId) {
  return {
    id: row.id,
    movieId: row.movie_id,
    userName: row.user_name,
    text: row.text,
    rating: row.rating,
    createdAt: row.created_at,
    isOwn: Boolean(viewerId) && row.user_id === viewerId,
  };
}

router.get('/', optionalAuth, (req, res) => {
  try {
    const { movieId } = req.params;
    const rows = listCommentsStmt.all(movieId);
    res.json({ comments: rows.map((r) => toPublicComment(r, req.userId)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar comentários' });
  }
});

router.post('/', requireAuth, writeLimiter, (req, res) => {
  try {
    const { movieId } = req.params;
    const movie = movies.find((m) => m.id === movieId);
    if (!movie) return res.status(404).json({ error: 'Título não encontrado' });

    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Comentário vazio' });
    if (text.length > MAX_LENGTH) return res.status(400).json({ error: 'Comentário muito longo' });

    const profile = findUserStmt.get(req.userId);
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (profile.account_type !== 'account') {
      return res.status(403).json({ error: 'Crie uma conta (com e-mail e senha) pra comentar.' });
    }

    // Se o usuário já avaliou esse título (estrelas no card), a nota
    // aparece junto do comentário — não é obrigatório ter avaliado pra
    // comentar.
    const feedbackRow = findFeedbackRatingStmt.get(`${req.userId}:${movieId}`);

    const id = uuidv4();
    insertCommentStmt.run({
      id,
      movieId,
      userId: req.userId,
      userName: profile.name,
      text,
      rating: feedbackRow?.rating ?? null,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ comment: toPublicComment(findCommentStmt.get(id), req.userId) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao publicar comentário' });
  }
});

router.delete('/:commentId', requireAuth, writeLimiter, (req, res) => {
  try {
    const { commentId } = req.params;
    const found = findCommentStmt.get(commentId);
    if (!found) return res.status(404).json({ error: 'Comentário não encontrado' });
    if (found.user_id !== req.userId) return res.status(403).json({ error: 'Sem permissão' });

    deleteCommentStmt.run(commentId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao excluir comentário' });
  }
});

module.exports = router;
