const rateLimit = require('express-rate-limit');

// Login é o alvo óbvio de força bruta — limite apertado. Não conta os
// pedidos que já deram certo (skipSuccessfulRequests), só as tentativas
// falhas, então um usuário legítimo digitando a senha certa não é
// penalizado pelos erros de outra pessoa na mesma rede/IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login — tente de novo em alguns minutos.' },
});

// Cadastro/edição de perfil: mais raro no uso normal, então um limite
// baixo já cobre gente de verdade e ainda barra criação de conta em massa.
const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições — tente de novo mais tarde.' },
});

// Avaliar/comentar: uso normal é esporádico, mas não tão raro quanto
// cadastro — limite mais folgado pra não incomodar quem tá navegando e
// avaliando vários títulos seguidos.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições — tente de novo mais tarde.' },
});

module.exports = { loginLimiter, accountLimiter, writeLimiter };
