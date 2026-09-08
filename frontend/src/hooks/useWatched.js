import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'truecine_watched';

// "Já vi" é local ao navegador (não depende de login) — funciona igual pra
// conta ou perfil anônimo, e não precisa de nenhuma mudança no backend além
// do filtro `excludeIds` que já existe em GET /api/movies.
export default function useWatched() {
  const [watchedIds, setWatchedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showWatched, setShowWatched] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchedIds));
    } catch {
      // localStorage indisponível (modo privado etc.) — segue sem persistir.
    }
  }, [watchedIds]);

  const isWatched = useCallback((id) => watchedIds.includes(id), [watchedIds]);

  const toggleWatched = useCallback((id) => {
    setWatchedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  return { watchedIds, isWatched, toggleWatched, showWatched, setShowWatched };
}
