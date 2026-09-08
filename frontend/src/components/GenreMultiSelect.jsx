import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';

// Dropdown customizado (não dá pra fazer multiseleção decente com um
// <select multiple> nativo — exigiria ctrl/cmd+clique, nada intuitivo).
// Fecha ao clicar fora ou pressionar Esc.
export default function GenreMultiSelect({ genres, selected, onChange }) {
  const { t, tGenre } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function toggle(g) {
    onChange(selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g]);
  }

  const label = selected.length === 0
    ? t('filter.allGenres')
    : selected.length === 1
      ? tGenre(selected[0])
      : t('filter.nGenres', { n: selected.length });

  return (
    <div className="genre-select" ref={rootRef}>
      <button
        type="button"
        className={selected.length ? 'genre-select-trigger active' : 'genre-select-trigger'}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className={open ? 'genre-select-chevron open' : 'genre-select-chevron'}>⌄</span>
      </button>

      {open && (
        <div className="genre-select-panel">
          <div className="chip-group">
            {genres.map((g) => (
              <button
                type="button"
                key={g}
                className={selected.includes(g) ? 'chip active' : 'chip'}
                onClick={() => toggle(g)}
              >
                {tGenre(g)}
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <button type="button" className="genre-select-clear" onClick={() => onChange([])}>
              {t('filter.clearSelection')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
