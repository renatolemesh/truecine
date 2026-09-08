import React from 'react';
import { useLanguage } from '../i18n/index.jsx';

// Monta a lista de páginas a exibir com reticências, tipo: 1 … 4 5 [6] 7 8 … 655
function buildPageList(current, total, delta = 2) {
  const pages = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    }
  }
  const withDots = [];
  let prev;
  pages.forEach((p) => {
    if (prev != null) {
      if (p - prev === 2) withDots.push(prev + 1);
      else if (p - prev > 2) withDots.push('…');
    }
    withDots.push(p);
    prev = p;
  });
  return withDots;
}

export default function Pagination({ page, totalPages, onChange, disabled }) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;
  const pages = buildPageList(page, totalPages);

  return (
    <nav className="pagination" aria-label={t('pagination.nav')}>
      <button
        type="button"
        className="page-btn"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={t('pagination.prev')}
      >
        ‹
      </button>

      {pages.map((p, i) => (p === '…' ? (
        // eslint-disable-next-line react/no-array-index-key
        <span key={`dots-${i}`} className="page-dots">…</span>
      ) : (
        <button
          key={p}
          type="button"
          className={p === page ? 'page-btn active' : 'page-btn'}
          disabled={disabled}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      )))}

      <button
        type="button"
        className="page-btn"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={t('pagination.next')}
      >
        ›
      </button>
    </nav>
  );
}
