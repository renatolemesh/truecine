import React, { useEffect, useState } from 'react';
import MovieCard from './MovieCard.jsx';
import { useLanguage } from '../i18n/index.jsx';
import { api } from '../api.js';

const RANKING_LIMIT = 10;

// "Ranking dos favoritados": os títulos mais marcados como filme/série
// favorito entre todos os perfis (ver POST /auth/favorite no backend e
// GET /ranking/favorites, que só conta esse campo do payload dos usuários).
export default function RankingModal({
  onClose, onOpen, isWatched, onToggleWatched, getRating, onRate,
}) {
  const { t } = useLanguage();
  const [type, setType] = useState('filme');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getFavoritesRanking(type, RANKING_LIMIT)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ranking-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        <h2>{t('ranking.title')}</h2>
        <p className="ranking-subtitle">{t('ranking.subtitle')}</p>

        <div className="lang-switch ranking-tabs" role="group">
          <button
            type="button"
            className={type === 'filme' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setType('filme')}
          >
            {t('filter.movies')}
          </button>
          <button
            type="button"
            className={type === 'serie' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setType('serie')}
          >
            {t('filter.series')}
          </button>
        </div>

        {loading ? (
          <p className="empty-message">{t('common.loading')}</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : items.length === 0 ? (
          <p className="empty-message">{t('ranking.empty')}</p>
        ) : (
          <div className="movie-grid ranking-grid">
            {items.map((m, idx) => (
              <div className="ranking-item" key={m.id}>
                <span className="ranking-rank">{idx + 1}º</span>
                <MovieCard
                  movie={m}
                  badge={`❤ ${m.favoriteCount}`}
                  watched={isWatched ? isWatched(m.id) : false}
                  onToggleWatched={onToggleWatched}
                  rating={getRating ? getRating(m.id) : 0}
                  onRate={onRate}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
