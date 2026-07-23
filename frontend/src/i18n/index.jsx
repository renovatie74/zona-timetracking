import { createContext, useContext, useState } from 'react';
import en from './en.json';
import pl from './pl.json';

const TRANSLATIONS = { en, pl };
export const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];

function readStoredLang() {
  try { return localStorage.getItem('zona-lang') ?? 'en'; } catch { return 'en'; }
}

const LangContext = createContext({
  lang:    'en',
  setLang: () => {},
  t:       k => k,
});

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);

  function setLang(code) {
    const safe = TRANSLATIONS[code] ? code : 'en';
    setLangState(safe);
    try { localStorage.setItem('zona-lang', safe); } catch { /* ignore */ }
  }

  function t(key) {
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
    const val  = Object.prototype.hasOwnProperty.call(dict, key)
      ? dict[key]
      : (TRANSLATIONS.en[key] ?? key);
    return val;
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LangContext);
}
