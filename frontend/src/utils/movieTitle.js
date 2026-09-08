// `title` no catálogo é o nome de exibição em PT-BR (aka oficial do IMDb
// quando existe uma tradução distinta; senão é o próprio título original).
// `originalTitle` só vem preenchido quando diverge do original em inglês.
// Em modo EN queremos mostrar o original como título principal — e, se
// houver um nome distinto em PT-BR, mostrá-lo como legenda (o inverso do
// que já acontecia em PT).

export function displayTitle(movie, lang) {
  if (lang === 'en') return movie.originalTitle || movie.title;
  return movie.title;
}

export function secondaryTitle(movie, lang) {
  if (lang === 'en') return movie.originalTitle ? movie.title : null;
  return movie.originalTitle || null;
}
