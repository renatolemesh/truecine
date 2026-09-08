const { verifyToken } = require('../services/authService');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Pra rotas públicas que ainda assim querem saber "esse pedido é do dono
// disso?" quando dá pra saber (ex.: listar comentários e marcar quais são
// do próprio usuário) — nunca bloqueia, só preenche req.userId se o token
// vier e for válido.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.userId = verifyToken(token).id;
    } catch (e) {
      // token ausente/inválido/expirado — segue como visitante anônimo
    }
  }
  next();
}

module.exports = requireAuth;
module.exports.optionalAuth = optionalAuth;
