import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'truecine_watchlist';

// "Quero ver depois" — mesmo padrão do "já vi" (useWatched.js): local ao
// navegador, funciona igual pra conta ou perfil anônimo. É uma lista
// diferente (antes de assistir, não depois) — dá pra estar nas duas ao
// mesmo tempo até marcar como visto, quando App.jsx tira da watchlist.
export default function useWatchlist() {
  const [watchlistIds, setWatchlistIds] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlistIds));
    } catch {
      // localStorage indisponível — segue sem persistir.
    }
  }, [watchlistIds]);

  const isInWatchlist = useCallback((id) => watchlistIds.includes(id), [watchlistIds]);

  const toggleWatchlist = useCallback((id) => {
    setWatchlistIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const removeFromWatchlist = useCallback((id) => {
    setWatchlistIds((prev) => prev.filter((x) => x !== id));
  }, []);

  return {
    watchlistIds, isInWatchlist, toggleWatchlist, removeFromWatchlist,
  };
}
