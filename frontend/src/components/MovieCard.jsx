import React, { useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';
import { displayTitle, secondaryTitle } from '../utils/movieTitle.js';
import StarRating from './StarRating.jsx';

// Pôster real quando temos `posterUrl` (buscado no TMDB, ver
// backend/scripts/fetch-posters.js). Pros poucos títulos sem pôster
// encontrado — ou se a imagem falhar ao carregar — caímos de volta num
// gradiente determinístico a partir do título, então o fallback do mesmo
// filme sempre tem a mesma cor.
function hashHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360;
  }
  return hash;
}

export default function MovieCard({
  movie, badge, watched, onToggleWatched, rating, onRate, onOpen, inWatchlist, onToggleWatchlist,
}) {
  const { t, tGenre, lang } = useLanguage();
  const [imgFailed, setImgFailed] = useState(false);
  // Chave no id (não no título exibido) pra cor do fallback não mudar
  // quando o usuário troca de idioma.
  const hue = hashHue(movie.id);
  const gradient = `linear-gradient(150deg, hsl(${hue}, 65%, 32%), hsl(${(hue + 40) % 360}, 70%, 16%))`;
  const showImage = Boolean(movie.posterUrl) && !imgFailed;
  const typeLabel = movie.type === 'serie' ? t('common.series') : t('common.movie');
  const title = displayTitle(movie, lang);
  const subtitle = secondaryTitle(movie, lang);

  const classes = ['movie-card'];
  if (watched) classes.push('watched');
  if (onOpen) classes.push('clickable');

  return (
    <div className={classes.join(' ')} onClick={onOpen ? () => onOpen(movie) : undefined}>
      <div className="movie-poster" style={{ background: gradient }}>
        {showImage && (
          <img
            className="movie-poster-img"
            src={movie.posterUrl}
            alt={title}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
        <span className="movie-poster-type">{typeLabel}</span>
        {badge != null && <span className="movie-poster-badge">{badge}</span>}
        {!showImage && <span className="movie-poster-title">{title}</span>}

        {onToggleWatchlist && (
          <button
            type="button"
            className={inWatchlist ? 'watchlist-toggle active' : 'watchlist-toggle'}
            onClick={(e) => { e.stopPropagation(); onToggleWatchlist(movie.id); }}
            title={inWatchlist ? t('watchlist.undo') : t('watchlist.mark')}
            aria-pressed={inWatchlist}
          >
            🔖
          </button>
        )}

        {onRate && (
          <StarRating value={rating || 0} onRate={(score) => onRate(movie.id, score)} />
        )}

        {onToggleWatched && (
          <button
            type="button"
            className={watched ? 'watched-toggle active' : 'watched-toggle'}
            onClick={(e) => { e.stopPropagation(); onToggleWatched(movie.id); }}
            title={watched ? t('watched.undo') : t('watched.mark')}
            aria-pressed={watched}
          >
            {watched ? '✓' : '👁'}
          </button>
        )}
      </div>
      <div className="movie-info">
        <div className="movie-info-row">
          <strong>{title}</strong>
          <span className="movie-rating">★ {movie.rating.toFixed(1)}</span>
        </div>
        {/* Sempre renderiza (mesmo vazia) pra todo card reservar a mesma
            altura — senão os títulos sem nome alternativo ficam mais baixos
            que os outros e o grid sobra um vão embaixo deles. */}
        <div className="movie-meta movie-original-title">{subtitle || ' '}</div>
        <div className="movie-meta">
          {movie.year} · {movie.genres.slice(0, 2).map(tGenre).join(', ')}
        </div>
        <div className="movie-meta">
          {movie.type === 'serie'
            ? (movie.seasons ? t('common.seasons', { n: movie.seasons }) : typeLabel)
            : (movie.runtimeMinutes ? t('common.minutes', { n: movie.runtimeMinutes }) : typeLabel)}
        </div>
      </div>
    </div>
  );
}
