import React, { createContext, useContext, useMemo, useState } from 'react';
import { translations } from './translations.js';

const STORAGE_KEY = 'truecine_lang';
const LanguageContext = createContext(null);

function detectDefaultLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch { /* localStorage indisponível */ }
  // Padrão pt, a menos que o navegador esteja claramente em outro idioma.
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectDefaultLang);

  function setLang(next) {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignora */ }
  }

  const t = useMemo(() => (key, vars) => {
    const template = translations[lang]?.[key] ?? translations.pt[key] ?? key;
    if (!vars) return template;
    return Object.keys(vars).reduce(
      (str, k) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]),
      template,
    );
  }, [lang]);

  // Tradução de gênero é só de exibição — o valor usado nos filtros/API
  // continua sendo sempre o nome em português (é a chave no backend).
  const tGenre = useMemo(() => (genre) => t(`genre.${genre}`) || genre, [t]);

  const value = useMemo(() => ({ lang, setLang, t, tGenre }), [lang, t, tGenre]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage precisa estar dentro de <LanguageProvider>');
  return ctx;
}
