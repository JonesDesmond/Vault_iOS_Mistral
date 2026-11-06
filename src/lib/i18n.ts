// Lightweight i18n. Keys are the English source strings; missing keys fall back to English.
import de from './i18n.de';
import fr from './i18n.fr';
import it from './i18n.it';
import el from './i18n.el';

export type Lang = 'en' | 'de' | 'fr' | 'it' | 'el';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'el', label: 'Ελληνικά' }
];

let current: Lang = 'en';
export function setLang(l: string): void { current = (LANGS.some(x => x.code === l) ? l : 'en') as Lang; }
export function getLang(): Lang { return current; }

export function t(key: string, vars?: Record<string, string | number>): string {
  const d = DICT[current] ?? {};
  let s = d[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

const DICT: Record<Lang, Record<string, string>> = { en: {}, de, fr, it, el };
