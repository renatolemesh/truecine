import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'truecine_watched';

// "Já vi" continua funcionando 100% local pra quem só está navegando sem
// nenhum perfil (não é bloqueado por login). Quando existe um perfil (guest
// ou conta), o App.jsx também sincroniza com o backend (GET/POST /api/watched)
// — isso faz "já vi" sobreviver entre sessões/dispositivos e alimentar o
// vetor de recomendação (ver routes/recommendations.js). Esse hook em si só
// cuida do cache local; `mergeWatchedIds` é o que permite juntar o que veio
// do servidor sem apagar o que só existia neste navegador ainda.
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

  const mergeWatchedIds = useCallback((ids) => {
    setWatchedIds((prev) => {
      const set = new Set(prev);
      let changed = false;
      ids.forEach((id) => {
        if (!set.has(id)) { set.add(id); changed = true; }
      });
      return changed ? [...set] : prev;
    });
  }, []);

  return {
    watchedIds, isWatched, toggleWatched, mergeWatchedIds, showWatched, setShowWatched,
  };
}
