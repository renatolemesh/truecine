import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'truecine_ratings';

// Espelha o localStorage de "já vi" (useWatched.js), mas guarda uma NOTA
// (0-10, em passos de 2 — vem do widget de 5 estrelas) em vez de um
// booleano "curtiu". Além de lembrar localmente qual nota o usuário deu
// (pra pintar as estrelas certas), avaliar dispara um POST /api/feedback
// (ver App.jsx) — é o que alimenta o feedback coletivo no Qdrant pra outros
// usuários com perfil parecido.
export default function useRating() {
  const [ratings, setRatings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
    } catch {
      // localStorage indisponível — segue sem persistir.
    }
  }, [ratings]);

  const getRating = useCallback((id) => ratings[id] || 0, [ratings]);

  const setRating = useCallback((id, score) => {
    setRatings((prev) => {
      if (!score) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: score };
    });
  }, []);

  return { ratings, getRating, setRating };
}
