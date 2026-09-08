const INSECURE_DEFAULT_SECRET = 'dev-secret-change-me';

const JWT_SECRET = process.env.JWT_SECRET || INSECURE_DEFAULT_SECRET;

if (JWT_SECRET === INSECURE_DEFAULT_SECRET) {
  // Com esse segredo padrão (público, está no repositório), qualquer um
  // consegue forjar um token válido pra QUALQUER usuário — inclusive
  // "virar" a conta de outra pessoa via PUT /auth/me. Não derruba o
  // servidor pra não travar quem só está rodando local sem configurar
  // nada, mas o aviso precisa ser impossível de ignorar.
  console.warn('\n'
    + '⚠️  ⚠️  ⚠️  ATENÇÃO — SEGURANÇA  ⚠️  ⚠️  ⚠️\n'
    + 'JWT_SECRET não foi definido — usando o valor padrão de desenvolvimento.\n'
    + 'Isso é uma vulnerabilidade séria se este servidor for exposto pra internet:\n'
    + 'qualquer pessoa pode forjar um token válido pra QUALQUER usuário.\n'
    + 'Defina um valor forte em backend/.env (ou no .env da raiz do projeto,\n'
    + 'que o docker-compose já lê): JWT_SECRET=<algo aleatório e longo>\n'
    + 'Gerar um: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"\n');
}

module.exports = {
  PORT: process.env.PORT || 4000,
  QDRANT_URL: process.env.QDRANT_URL || 'http://qdrant:6333',
  JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN || null,
  // "Onde assistir" (routes/providers.js) fica desligado (sem erro, só
  // sem seção na ficha do filme) se essa variável não estiver definida.
  TMDB_READ_TOKEN: process.env.TMDB_READ_TOKEN || null,
  // Só o catálogo (o que É busca por similaridade) mora no Qdrant — ver
  // comentário no topo de db/sqlite.js sobre o resto dos dados.
  MOVIES_COLLECTION: 'movies',
  // Arquivo único do SQLite — precisa apontar pra dentro de um volume
  // Docker (ver docker-compose.yml) pra sobreviver a rebuilds do container.
  SQLITE_PATH: process.env.SQLITE_PATH || '/app/data/truecine.db',
};
