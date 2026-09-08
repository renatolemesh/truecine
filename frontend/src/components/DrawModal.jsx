import React, { useEffect, useRef, useState } from 'react';
import MovieCard from './MovieCard.jsx';
import { useLanguage } from '../i18n/index.jsx';

// Efeito de "roleta": enquanto `spinning` for true, troca a carta exibida
// bem rápido (a partir de uma amostra do catálogo já carregado — é só pra
// dar a sensação de sorteio, o resultado de verdade vem do backend). Quando
// `spinning` vira false, mostra o(s) resultado(s) reais.
export default function DrawModal({
  open, spinning, results, spinPool, onClose, onDrawAgain, isWatched, onToggleWatched, getRating, onRate, onOpen,
  isInWatchlist, onToggleWatchlist,
}) {
  const { t } = useLanguage();
  const [spinIndex, setSpinIndex] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (spinning && spinPool.length) {
      intervalRef.current = setInterval(() => {
        setSpinIndex((i) => (i + 1 + Math.floor(Math.random() * 3)) % spinPool.length);
      }, 90);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [spinning, spinPool]);

  if (!open) return null;

  const spinItem = spinPool.length ? spinPool[spinIndex % spinPool.length] : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal draw-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        <h2>{t('draw.title')}</h2>

        {spinning ? (
          <div className="draw-spin-area">
            {spinItem && (
              <div className="draw-spin-card" key={`${spinItem.id}-${spinIndex}`}>
                <MovieCard movie={spinItem} />
              </div>
            )}
            <p className="draw-spin-label">{t('draw.spinning')}</p>
          </div>
        ) : (
          <>
            {results && results.length > 0 ? (
              <div className="movie-grid draw-results-grid">
                {results.map((m) => (
                  <MovieCard
                    key={m.id}
                    movie={m}
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
            ) : (
              <p className="empty-message">{t('draw.noResults')}</p>
            )}
            <div className="draw-actions">
              <button type="button" className="btn btn-primary" onClick={onDrawAgain}>{t('draw.again')}</button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
