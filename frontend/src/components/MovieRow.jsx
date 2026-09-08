import React from 'react';
import MovieCard from './MovieCard.jsx';

export default function MovieRow({
  title, subtitle, movies, badgeFn, emptyMessage, isWatched, onToggleWatched, getRating, onRate, onOpen,
  isInWatchlist, onToggleWatchlist, headerAction,
}) {
  return (
    <section className="movie-row">
      <div className="movie-row-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {headerAction}
      </div>
      {movies.length === 0 ? (
        <p className="empty-message">{emptyMessage || 'Nada encontrado.'}</p>
      ) : (
        <div className="movie-grid">
          {movies.map((m) => (
            <MovieCard
              key={m.id}
              movie={m}
              badge={badgeFn ? badgeFn(m) : null}
              watched={isWatched ? isWatched(m.id) : false}
              onToggleWatched={onToggleWatched}
              rating={getRating ? getRating(m.id) : 0}
              onRate={onRate}
              onOpen={onOpen}
              inWatchlist={isInWatchlist ? isInWatchlist(m.id) : false}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </div>
      )}
    </section>
  );
}
