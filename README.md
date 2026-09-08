# True Cine — recomendação de filmes e séries

Projeto de estudo inspirado no [exemplo de recomendação de e-commerce com
TensorFlow.js](https://github.com/unipds-engenharia-de-ia-aplicada/engenharia-de-software-com-ia-aplicada/blob/main/modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte05-ecommerce-recomendations-with-tensorflow/src/workers/modelTrainingWorker.js),
adaptado para o domínio de filmes/séries. Usa três peças
juntas: um **banco de dados vetorial (Qdrant)** para busca por similaridade
no catálogo, um **banco relacional (SQLite)** para perfis/avaliações/
comentários, e uma **rede neural em TensorFlow.js**, treinada em tempo real
no navegador (dentro de um Web Worker, igual ao projeto de referência), para
o re-ranking final.

## Como a recomendação funciona (duas etapas)

No projeto de referência, produtos e usuários viravam vetores numéricos
normalizados (preço, categoria, cor, idade) e uma rede neural, treinada num
Web Worker, aprendia a prever compatibilidade entre os dois vetores.

Aqui o mesmo vetor numérico existe, mas o trabalho é dividido em duas
etapas — o padrão *retrieval + ranking* usado por recomendadores de verdade:

```
vetor = [ ...one-hot de 20 gêneros, ano normalizado, nota normalizada, tipo (filme/série), classificação indicativa ]
```

1. **Retrieval (Qdrant)** — `backend/src/routes/recommendations.js` busca no
   banco vetorial os ~150 filmes/séries com vetor mais próximo (cosine
   similarity) do vetor de preferências do usuário, dentre os ~19,6 mil do
   catálogo. Rápido mesmo em escala, graças ao índice vetorial (ANN) do
   Qdrant. Junto, devolve uma amostra aleatória de títulos pouco relevantes
   ("negativos") — vira dado de treino sintético para a etapa seguinte.
2. **Ranking (TensorFlow.js)** — `frontend/src/workers/recommendationWorker.js`
   treina, ali mesmo no seu navegador (Web Worker, não trava a UI), uma rede
   pequena (entrada = vetor do usuário concatenado com vetor do filme → 32 →
   16 → 1 neurônio sigmoid) usando os candidatos do Qdrant como exemplos
   positivos e a amostra aleatória como negativos. Depois de treinada
   (~40 épocas, poucos segundos), a rede reordena os candidatos — é essa
   ordem final que aparece em "Recomendado para você".

- **Filme/série** (`backend/src/services/vectorizer.js#buildMovieVector`,
  espelhado em `frontend/src/ml/vectorizer.js` pro Web Worker): gêneros
  viram one-hot normalizado, ano e nota são escalados para 0–1, tipo é 0
  (filme) ou 1 (série), e a classificação indicativa (G/PG/PG-13/R) vira um
  valor de 0.1 a 0.8.
- **Usuário** (`buildUserVector`): não fica guardado em lugar nenhum — é
  recalculado a cada request de recomendação, a partir do perfil atual no
  SQLite. Os gêneros favoritos escolhidos no cadastro viram pesos nesse
  mesmo vetor de gêneros; esse "histórico" que entra na mistura (60%
  preferência declarada + 40% histórico, mesma lógica de "média do
  histórico de compras" do projeto original) não é só o que foi marcado no
  formulário — vai se ampliando com o uso: títulos avaliados bem (nota ≥ 7)
  e títulos marcados como "já vi" (exceto os avaliados mal) entram na
  mesma conta, então o perfil se ajusta com o tempo em vez de ficar
  congelado na resposta inicial do cadastro. A **idade** não vira peso de
  gênero (para não estereotipar "jovem gosta de ação") — ela é traduzida
  para uma classificação indicativa alvo, no mesmo eixo usado pelos filmes.
  O **sexo** é armazenado no perfil mas não influencia o vetor.

Só o catálogo mora no Qdrant — é o único dado que de fato usa busca por
similaridade (retrieval acima, e "títulos parecidos"). Perfis, avaliações e
comentários ficam num banco relacional (SQLite, ver seção abaixo) — no
início do projeto também viviam no Qdrant, mas nunca usavam busca vetorial
de verdade, só "por id" ou "filtrar por campo" (banco vetorial fazendo papel
de banco de documentos). A rede neural não é persistida: ela é treinada do zero
a cada vez que a tela de recomendações carrega (assim como no projeto de
referência).

## Por que SQLite (e não Postgres) pros dados relacionais

Perfis, avaliações (feedback coletivo) e comentários ficam em
`backend/src/db/sqlite.js`, via o módulo nativo `node:sqlite` do Node (sem
dependência externa, sem compilação — só precisa do Node 24+). Isso dá as
garantias que faltavam quando isso vivia dentro do Qdrant: `UNIQUE` de
verdade no e-mail (antes era "busca, se não achou cria" — uma race condition
real), chave estrangeira (`ON DELETE CASCADE`), agregação com SQL de verdade
(o ranking de favoritos é um `GROUP BY`, não mais um scroll da coleção
inteira contado em memória).

Um Postgres separado teria as mesmas garantias, mas exigiria mais um
container/serviço pra um volume de dados (perfis + avaliações + comentários)
que um arquivo único já atende com folga — SQLite lida bem com isso até a
casa de dezenas/centenas de milhares de linhas, bem acima do que este
projeto espera ter. O arquivo mora num volume Docker (`sqlite_data`), então
sobrevive a rebuilds do container igual o `qdrant_data`.

## De onde vêm os dados do catálogo

`backend/src/data/movies.json` (~19.650 títulos) foi gerado combinando duas
fontes públicas — o script reprodutível está em
`backend/scripts/import-dataset.js` (não roda automaticamente, só quando
você quiser atualizar o catálogo):

1. **[Netflix TV Shows and Movies](https://github.com/amirtds/kaggle-netflix-tv-shows-and-movies)**
   — mirror público (sem login) de um dataset do Kaggle. Fornece sinopse,
   mas cobre só o catálogo histórico da Netflix (~5,7 mil títulos).
2. **[Datasets não-comerciais oficiais do IMDb](https://datasets.imdbws.com/)**
   (`title.basics.tsv.gz` + `title.ratings.tsv.gz`) — usados para trazer
   nota/nº de votos oficiais e ampliar o catálogo para além da Netflix
   (filtrado para títulos com pelo menos 10.000 votos, senão o dataset
   bruto passa de 1 milhão de linhas). Não inclui sinopse nem classificação
   indicativa — por isso ~71% dos títulos (os que só vieram do IMDb, sem
   correspondência no Kaggle) mostram "Sinopse não disponível" e usam
   `PG-13` como classificação padrão.
3. **`title.akas.tsv.gz`** (também do IMDb) — traz o título como é
   conhecido em cada região. Filtramos pela região `BR` para exibir o nome
   usado no Brasil (ex.: *The Shawshank Redemption* → **Um Sonho de
   Liberdade**), guardando o original em `originalTitle` (mostrado como
   subtítulo no card). Quando não existe título BR distinto do original
   (ex.: *Breaking Bad*, que não é traduzido no Brasil), o título original é
   mantido sem alteração — ~13,3 mil dos ~19,6 mil títulos tiveram o nome
   BR aplicado.

O merge: quando um título do Kaggle tem `imdb_id` reconhecido no dataset do
IMDb, a nota/votos são substituídos pelos valores oficiais e os gêneros são
unidos; o restante dos títulos do IMDb entra no catálogo sem sinopse. Por
cima disso tudo, o título BR (quando existe) substitui o título em inglês.

⚠️ Uso dos datasets do IMDb é regido pelos [termos não-comerciais deles](https://www.imdb.com/interfaces/) — ok para estudo/demo, não para uso comercial sem licenciar com a IMDb/Amazon.

### Pôsteres (opcional, precisa de uma API key do TMDB)

Por padrão os cards mostram um "pôster" gerado (gradiente + título) — dá pra
rodar o app inteiro sem depender de nenhuma API externa. Pra usar pôsteres
reais, dois scripts (rodam só uma vez, offline, o resultado fica salvo em
`movies.json` — o app em si nunca chama o TMDB em runtime):

```bash
cd backend

# 1) Busca o poster_path de cada título no TMDB via imdbId (endpoint /find).
#    Demora alguns minutos pro catálogo inteiro; é resumível (se cair no
#    meio, roda de novo que ele pula os já feitos).
TMDB_READ_TOKEN=<seu Read Access Token do TMDB> node scripts/fetch-posters.js

# 2) Aplica os resultados em src/data/movies.json como `posterUrl`
node scripts/apply-posters.js
```

Chave gratuita em https://www.themoviedb.org/settings/api (Read Access
Token). Títulos sem pôster encontrado continuam usando o gradiente como
fallback — o `MovieCard` já lida com isso automaticamente.

## Arquitetura

```
┌───────────────────┐  REST/JSON  ┌──────────────┐
│      frontend      │────────────▶│   backend    │
│    React + Vite     │◀──────────── │ Node/Express │
│  (nginx + proxy)     │            └──────┬───────┘
│                       │                   │
│  Web Worker            │        ┌─────────┴─────────┐
│  (TensorFlow.js): treina │       ▼                    ▼
│  com os candidatos que     │ ┌────────┐         ┌───────────┐
│  vieram do backend e         │ qdrant │         │  sqlite    │
│  reordena localmente           │ catálogo │       │ perfis,    │
└───────────────────┘           │ (vetor)  │       │ notas,     │
                                 └────────┘         │ comentários │
                                                     └───────────┘
```

- `frontend/`: React + Vite, servido por nginx (que também faz proxy de
  `/api` para o backend). Home com grade de filmes/séries, filtros (tipo,
  gênero multiseleção, nota, ano, ordenação), busca, paginação, botão
  "🎲 Sortear" (roleta que escolhe N títulos aleatórios respeitando os
  filtros ativos), marcar título como "já vi" (oculta do catálogo, com
  opção de mostrar/desfazer — persistido em `localStorage`), modais de
  **Entrar** e **Cadastrar** (com dois modos: criar conta ou só informar
  dados), interface bilíngue PT/EN (`src/i18n/`, sem biblioteca externa), e
  o Web Worker de TensorFlow.js que faz o re-ranking das recomendações
  (`src/workers/recommendationWorker.js`).
- `backend/`: Node.js + Express. Autenticação (JWT), catálogo, e o endpoint
  de recomendações — que faz a etapa de *retrieval* no Qdrant e devolve
  candidatos + amostra negativa para o front treinar o modelo.
- `qdrant/`: banco de dados vetorial (imagem oficial `qdrant/qdrant`), só com
  a coleção `movies` (catálogo com vetor de conteúdo) — o único dado do
  projeto que de fato precisa de busca por similaridade.
- SQLite (`backend/src/db/sqlite.js`, arquivo em `sqlite_data`, sem
  container próprio): perfis (`users`), avaliações/feedback coletivo
  (`feedback`), comentários (`comments`) e "já vi" (`watched`) — ver seção
  acima.

## Rodando com Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api (health check em `/api/health`)
- Qdrant (dashboard/API): http://localhost:6333/dashboard

Por padrão as portas ficam publicadas só em `127.0.0.1` (loopback) no
`docker-compose.yml` — ou seja, só acessível na própria máquina, não exposto
pra rede/internet. Se quiser acessar de outra máquina/rede de propósito,
troque `127.0.0.1:5173:5173` (e as outras) por só `5173:5173` — mas aí a
porta fica aberta pra qualquer um que alcançar essa máquina na rede, então
só faça isso sabendo o que está expondo.

Ao subir, o backend cria as tabelas do SQLite se não existirem (`db/sqlite.js`,
instantâneo) e depois aguarda o Qdrant ficar disponível, cria a coleção
`movies` se não existir e popula o catálogo (~19,6 mil títulos) na primeira
execução (`db/qdrant.js`) — o seed roda em lotes de 500 e leva cerca de 1
minuto. Se `data/movies.json` mudar de tamanho depois (ex.: você rodou o
script de import de novo), a coleção é recriada automaticamente.

**Acessando de um host diferente de `localhost`** (ex.: máquina remota, ou
um túnel/port-forward de IDE): o frontend é servido por nginx e faz proxy de
`/api/*` para o backend internamente na rede do docker-compose — o
navegador só fala com a própria origem da página, então funciona igual não
importa qual host/porta você usa para abrir `http://SEU_HOST:5173`. Não é
necessário configurar nada extra.

## Variáveis de ambiente

Copie `.env.example` para `.env` para customizar:

- `JWT_SECRET`: segredo usado para assinar os tokens de sessão. **Obrigatório
  definir um valor forte e aleatório se o servidor for exposto pra internet**
  — sem isso o backend usa um valor padrão inseguro (avisa bem alto no log
  se isso acontecer). Gerar um: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
- `TMDB_READ_TOKEN` (opcional): Read Access Token do [TMDB](https://www.themoviedb.org/settings/api).
  Sem ele, pôsteres (se não tiverem sido aplicados via script), trailer,
  elenco e "onde assistir" simplesmente não aparecem — o resto do site
  funciona normalmente.
- `CORS_ORIGIN` (opcional): restringe a API a aceitar requisições só desse
  domínio (ex.: `https://seu-dominio.com`). Sem definir, aceita qualquer
  origem — ok para uso atrás de um proxy same-origin.
- `SQLITE_PATH` (opcional): caminho do arquivo do banco relacional (perfis,
  avaliações, comentários). Padrão `/app/data/truecine.db`, dentro do volume
  Docker `sqlite_data` — não precisa mexer nisso rodando com `docker compose`.

## Endpoints principais

| Método | Rota                    | Descrição                                   |
|--------|-------------------------|----------------------------------------------|
| GET    | `/api/movies`           | Lista o catálogo — ver filtros abaixo |
| GET    | `/api/movies/genres`    | Lista de gêneros disponíveis                 |
| GET    | `/api/movies/providers` | Lista de serviços de streaming disponíveis pro filtro `provider` |
| GET    | `/api/movies/:id`       | Detalhe de um título                         |
| GET    | `/api/movies/:id/similar` | Títulos parecidos (mesmo mecanismo do Qdrant, a partir do vetor do próprio filme) |
| GET    | `/api/movies/:id/providers` | Onde assistir (streaming/aluguel/compra), busca ao vivo no TMDB — ver `?region=BR\|US` |
| GET    | `/api/movies/:id/extras` | Trailer (YouTube) + elenco/direção, busca ao vivo no TMDB |
| GET    | `/api/movies/:id/comments` | Comentários do título (público) |
| POST   | `/api/movies/:id/comments` | Publica um comentário (requer conta) |
| DELETE | `/api/movies/:id/comments/:commentId` | Exclui um comentário próprio |
| POST   | `/api/auth/register`    | Cria conta ou perfil anônimo                 |
| POST   | `/api/auth/login`       | Login (apenas para quem criou conta)         |
| GET    | `/api/auth/me`          | Perfil do usuário autenticado                |
| PUT    | `/api/auth/me`          | Edita o perfil — inclusive "virar conta" (adicionar e-mail/senha a um perfil anônimo) |
| POST   | `/api/auth/favorite`    | Marca/desmarca o filme ou série favorita do perfil (um de cada tipo) |
| GET    | `/api/recommendations`  | Candidatos + amostra negativa para o front treinar o modelo (requer token) |
| POST   | `/api/feedback`         | Avalia um título (0-10, estrelas) — requer conta; alimenta o feedback coletivo e o próprio vetor de recomendação |
| GET    | `/api/watched`          | Lista os ids marcados como "já vi" pelo perfil (requer perfil — guest ou conta) |
| POST   | `/api/watched`          | Marca/desmarca "já vi" (`{movieId, watched}`) — sincroniza com o `localStorage` do navegador e também alimenta o vetor de recomendação |
| GET    | `/api/ranking/favorites` | Ranking dos títulos mais marcados como favorito — `?type=filme\|serie&limit=N` |

Filtros/ordenação de `GET /api/movies` (todos opcionais, combináveis):

| Parâmetro    | Valores                                                                 | Observação |
|--------------|--------------------------------------------------------------------------|------------|
| `type`       | `filme` \| `serie`                                                       | |
| `genre`      | nome do gênero — pode repetir (`?genre=Ação&genre=Terror`) para multiseleção | filtro "E": precisa ter todos os gêneros marcados |
| `search`     | texto livre                                                               | busca no título |
| `minRating` / `maxRating` | número (ex: `7`, `9.5`)                                     | intervalo de nota |
| `yearMin` / `yearMax` | ano                                                               | intervalo de lançamento |
| `excludeIds` | ids separados por vírgula                                                 | usado pelo "já vi" — oculta títulos marcados como vistos (guardados no `localStorage` do navegador) |
| `provider`   | nome do serviço (ex.: `Netflix`)                                          | snapshot gerado por `scripts/fetch-providers.js` (ver abaixo) — não é ao vivo |
| `sort`       | `popularity` (padrão) \| `rating` \| `year_desc` \| `year_asc` \| `runtime_asc` \| `runtime_desc` | `rating` usa nota ponderada pelo nº de votos (mesma técnica do Top 250 do IMDb), pra título com poucos votos não furar o ranking |
| `page` / `pageSize` | número                                                            | paginação |
| `random` / `count` | `random=true` + `count=N`                                          | modo "sortear": ignora ordenação/paginação e devolve N títulos aleatórios dentre os que passam nos outros filtros |

## Desenvolvimento local sem Docker

```bash
# banco vetorial (só o catálogo)
docker run -p 6333:6333 qdrant/qdrant:v1.11.0

# backend — precisa do Node 24+ (usa node:sqlite nativo pros dados
# relacionais; não precisa subir mais nada pra isso, é um arquivo local)
cd backend && npm install && npm run dev

# frontend
cd frontend && npm install && npm run dev
```

## Possíveis evoluções

- Trocar o catálogo estático por uma API real (ex.: TMDB) mantendo o mesmo
  pipeline de vetorização.
- Gerar embeddings semânticos da sinopse (ex.: sentence-transformers) e
  concatenar ao vetor de conteúdo para capturar similaridade de enredo, não
  só de gênero.
- Registrar interações (assistiu, avaliou) e realimentar o vetor do usuário
  ao longo do tempo, em vez de só usar o que foi informado no cadastro.
