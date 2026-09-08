// Lista de gêneros usada nos filtros do front e na posição de cada gênero
// dentro do vetor de conteúdo (one-hot). É a união dos vocabulários dos dois
// datasets importados (ver scripts/import-dataset.js): o mirror do Kaggle
// (Netflix) e o dataset oficial não-comercial do IMDb.
module.exports = [
  'Ação',
  'Animação',
  'Aventura',
  'Comédia',
  'Crime',
  'Documentário',
  'Drama',
  'Família',
  'Fantasia',
  'História',
  'Terror',
  'Música',
  'Mistério',
  'Reality',
  'Romance',
  'Ficção Científica',
  'Esporte',
  'Suspense',
  'Guerra',
  'Faroeste',
];
