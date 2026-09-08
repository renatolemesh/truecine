import React, { useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';

// Widget de 5 estrelas sobre o pôster. `value` vem em 0-10 (mesma escala da
// nota do IMDb exibida no resto do app) — cada estrela vale 2 pontos, então
// clicar na 3ª estrela grava nota 6. Clicar de novo na estrela já
// selecionada (a "última" preenchida) desfaz a avaliação.
export default function StarRating({ value = 0, onRate }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(0);
  const filled = Math.round(value / 2);
  const display = hover || filled;

  return (
    <div
      className="star-rating"
      role="group"
      aria-label={t('rating.label')}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          className={s <= display ? 'star-btn filled' : 'star-btn'}
          onMouseEnter={() => setHover(s)}
          onFocus={() => setHover(s)}
          onClick={() => onRate(s === filled ? 0 : s * 2)}
          aria-label={t('rating.stars', { n: s })}
          aria-pressed={s <= filled}
        >
          {s <= display ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
