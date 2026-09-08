// Catálogo real, importado do dataset público "Netflix TV Shows and Movies"
// (originalmente publicado no Kaggle, espelhado sem autenticação em
// https://github.com/amirtds/kaggle-netflix-tv-shows-and-movies/blob/main/titles.csv).
//
// O arquivo movies.json foi gerado por scripts/import-dataset.js — para
// atualizar o catálogo, rode esse script novamente (ele baixa o CSV de novo,
// mapeia gêneros/classificação indicativa para o formato usado aqui e
// regrava movies.json). Isso é feito uma vez, offline — o backend em si
// nunca precisa de acesso à internet para rodar.
module.exports = require('./movies.json');
