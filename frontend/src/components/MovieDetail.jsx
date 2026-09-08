import React, { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';
import { displayTitle, secondaryTitle } from '../utils/movieTitle.js';
import StarRating from './StarRating.jsx';
import MovieRow from './MovieRow.jsx';
import { api } from '../api.js';

// "Aba" de detalhe do título — abre ao clicar num card (em qualquer lugar
// que não seja um dos botões que já têm sua própria ação, como as estrelas
// ou o "já vi", que fazem stopPropagation). Mostra a ficha completa,
// trailer/elenco, onde assistir, títulos parecidos e comentários.
export default function MovieDetail({
  movie, onClose, onOpen, profile, getRating, onRate, isWatched, onToggleWatched,
  isInWatchlist, onToggleWatchlist, onToggleFavorite, onRequireAccount,
}) {
  const { t, tGenre, lang } = useLanguage();
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [providers, setProviders] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [extras, setExtras] = useState(null);
  const [similar, setSimilar] = useState([]);

  const movieId = movie?.id;
  // Sem campo de país próprio pra isso ainda — usa o idioma da interface
  // como atalho (PT -> BR, EN -> US) pra escolher a região do catálogo de
  // streaming, que é bem diferente de país pra país.
  const providerRegion = lang === 'en' ? 'US' : 'BR';

  useEffect(() => {
    if (!movieId) return;
    // Fecha a "aba" atual e reabre do zero pro título novo — evita mostrar
    // por um instante o trailer/comentários do filme anterior enquanto o
    // próximo ainda está carregando (acontece ao clicar num "título
    // parecido" dentro do próprio detalhe).
    setComments([]);
    setCommentText('');
    setCommentError('');
    setProviders(null);
    setExtras(null);
    setSimilar([]);

    setLoadingComments(true);
    api.getComments(movieId)
      .then((d) => setComments(d.comments))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));

    setLoadingProviders(true);
    api.getProviders(movieId, providerRegion)
      .then((d) => setProviders(d.providers))
      .catch(() => setProviders(null))
      .finally(() => setLoadingProviders(false));

    api.getExtras(movieId).then((d) => setExtras(d.extras)).catch(() => setExtras(null));
    api.getSimilar(movieId).then((d) => setSimilar(d.items)).catch(() => setSimilar([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, providerRegion]);

  if (!movie) return null;

  const title = displayTitle(movie, lang);
  const subtitle = secondaryTitle(movie, lang);
  const typeLabel = movie.type === 'serie' ? t('common.series') : t('common.movie');
  const hasAccount = profile?.accountType === 'account';
  const watched = isWatched ? isWatched(movie.id) : false;
  const inWatchlist = isInWatchlist ? isInWatchlist(movie.id) : false;
  const favoriteField = movie.type === 'serie' ? 'favoriteSeriesId' : 'favoriteMovieId';
  const isFavorite = profile?.[favoriteField] === movie.id;

  async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!hasAccount) { onRequireAccount(); return; }
    const text = commentText.trim();
    if (!text) return;
    setPosting(true);
    setCommentError('');
    try {
      const { comment } = await api.postComment(movie.id, text);
      setComments((prev) => [comment, ...prev]);
      setCommentText('');
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteComment(id) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('comments.deleteConfirm'))) return;
    const prev = comments;
    setComments((cur) => cur.filter((c) => c.id !== id));
    try {
      await api.deleteComment(movie.id, id);
    } catch {
      setComments(prev); // desfaz se o backend não confirmou
    }
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR');
    } catch {
      return '';
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal movie-detail" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>

        <div className="movie-detail-header">
          <div className="movie-detail-poster">
            {movie.posterUrl
              ? <img src={movie.posterUrl} alt={title} />
              : <div className="movie-detail-poster-fallback">{title}</div>}
          </div>
          <div className="movie-detail-info">
            <h2>{title}</h2>
            {subtitle && <p className="movie-original-title">{subtitle}</p>}
            <p className="movie-detail-meta">
              {movie.year} · {movie.genres.map(tGenre).join(', ')} · ★ {movie.rating.toFixed(1)}
            </p>
            <p className="movie-detail-meta">
              {movie.type === 'serie'
                ? (movie.seasons ? t('common.seasons', { n: movie.seasons }) : typeLabel)
                : (movie.runtimeMinutes ? t('common.minutes', { n: movie.runtimeMinutes }) : typeLabel)}
              {movie.maturity ? ` · ${movie.maturity}` : ''}
            </p>

            <div className="movie-detail-actions">
              <StarRating
                value={getRating ? getRating(movie.id) : 0}
                onRate={(score) => onRate(movie.id, score)}
              />
              {onToggleWatched && (
                <button
                  type="button"
                  className={watched ? 'btn btn-ghost active' : 'btn btn-ghost'}
                  onClick={() => onToggleWatched(movie.id)}
                >
                  {watched ? `✓ ${t('watched.undo')}` : `👁 ${t('watched.mark')}`}
                </button>
              )}
              {onToggleWatchlist && (
                <button
                  type="button"
                  className={inWatchlist ? 'btn btn-ghost active' : 'btn btn-ghost'}
                  onClick={() => onToggleWatchlist(movie.id)}
                >
                  {inWatchlist ? `🔖 ${t('watchlist.undo')}` : `🔖 ${t('watchlist.mark')}`}
                </button>
              )}
              {onToggleFavorite && (
                <button
                  type="button"
                  className={isFavorite ? 'btn btn-ghost active' : 'btn btn-ghost'}
                  onClick={() => onToggleFavorite(movie.id)}
                >
                  {isFavorite
                    ? `🏆 ${t(movie.type === 'serie' ? 'favorite.undoSeries' : 'favorite.undoMovie')}`
                    : `🏆 ${t(movie.type === 'serie' ? 'favorite.markSeries' : 'favorite.markMovie')}`}
                </button>
              )}
            </div>

            <h3 className="movie-detail-section-title">{t('detail.overview')}</h3>
            <p className="movie-detail-overview">{movie.overview || t('detail.noOverview')}</p>
          </div>
        </div>

        {extras?.trailerKey && (
          <div className="trailer-section">
            <h3 className="movie-detail-section-title">{t('extras.trailer')}</h3>
            <div className="trailer-embed">
              <iframe
                src={`https://www.youtube.com/embed/${extras.trailerKey}`}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {extras?.cast?.length > 0 && (
          <div className="cast-section">
            <h3 className="movie-detail-section-title">{t('extras.cast')}</h3>
            {extras.director && (
              <p className="movie-detail-meta cast-director">{t('extras.director')}: {extras.director}</p>
            )}
            <div className="cast-list">
              {extras.cast.map((p) => (
                <div key={p.name} className="cast-item">
                  {p.photo
                    ? <img src={p.photo} alt={p.name} className="cast-photo" />
                    : <div className="cast-photo cast-photo-fallback">{p.name[0]}</div>}
                  <span className="cast-name">{p.name}</span>
                  {p.character && <span className="cast-character">{p.character}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loadingProviders && providers && (
          providers.flatrate.length > 0 || providers.rent.length > 0 || providers.buy.length > 0
        ) && (
          <div className="providers-section">
            <h3 className="movie-detail-section-title">{t('providers.title')}</h3>
            {providers.flatrate.length > 0 && (
              <div className="provider-group">
                <span className="provider-group-label">{t('providers.flatrate')}</span>
                <div className="provider-logos">
                  {providers.flatrate.map((p) => (
                    <img key={p.name} src={p.logo} alt={p.name} title={p.name} className="provider-logo" />
                  ))}
                </div>
              </div>
            )}
            {providers.rent.length > 0 && (
              <div className="provider-group">
                <span className="provider-group-label">{t('providers.rent')}</span>
                <div className="provider-logos">
                  {providers.rent.map((p) => (
                    <img key={p.name} src={p.logo} alt={p.name} title={p.name} className="provider-logo" />
                  ))}
                </div>
              </div>
            )}
            {providers.buy.length > 0 && (
              <div className="provider-group">
                <span className="provider-group-label">{t('providers.buy')}</span>
                <div className="provider-logos">
                  {providers.buy.map((p) => (
                    <img key={p.name} src={p.logo} alt={p.name} title={p.name} className="provider-logo" />
                  ))}
                </div>
              </div>
            )}
            <a className="provider-attribution" href={providers.link} target="_blank" rel="noreferrer">
              {t('providers.attribution')}
            </a>
          </div>
        )}

        {similar.length > 0 && (
          <div className="similar-section">
            <MovieRow
              title={t('detail.similar')}
              movies={similar}
              getRating={getRating}
              onRate={onRate}
              isWatched={isWatched}
              onToggleWatched={onToggleWatched}
              isInWatchlist={isInWatchlist}
              onToggleWatchlist={onToggleWatchlist}
              onOpen={onOpen}
            />
          </div>
        )}

        <div className="comments-section">
          <h3 className="movie-detail-section-title">{t('comments.title')}</h3>

          {hasAccount ? (
            <form className="comment-form" onSubmit={handleCommentSubmit}>
              <textarea
                placeholder={t('comments.placeholder')}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={2000}
                rows={3}
              />
              {commentError && <p className="form-error">{commentError}</p>}
              <button type="submit" className="btn btn-primary" disabled={posting || !commentText.trim()}>
                {posting ? t('comments.submitting') : t('comments.submit')}
              </button>
            </form>
          ) : (
            <button type="button" className="btn btn-ghost btn-full comment-login-prompt" onClick={onRequireAccount}>
              {t('comments.loginPrompt')}
            </button>
          )}

          {loadingComments ? (
            <p className="empty-message">{t('comments.loading')}</p>
          ) : comments.length === 0 ? (
            <p className="empty-message">{t('comments.empty')}</p>
          ) : (
            <ul className="comment-list">
              {comments.map((c) => (
                <li key={c.id} className="comment-item">
                  <div className="comment-item-header">
                    <strong>{c.userName}</strong>
                    {c.rating != null && <span className="comment-item-rating">★ {c.rating}/10</span>}
                    <span className="comment-item-date">{formatDate(c.createdAt)}</span>
                    {c.isOwn && (
                      <button type="button" className="comment-item-delete" onClick={() => handleDeleteComment(c.id)}>
                        {t('comments.delete')}
                      </button>
                    )}
                  </div>
                  <p className="comment-item-text">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
