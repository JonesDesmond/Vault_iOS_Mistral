import { describe, it, expect } from 'vitest';
import { t, setLang, getLang, LANGS } from './i18n';

describe('i18n', () => {
  it('falls back to the English key when no translation exists', () => {
    setLang('en');
    expect(t('Overview')).toBe('Overview');
    expect(t('some unknown key')).toBe('some unknown key');
  });

  it('translates into all supported languages', () => {
    expect(LANGS.map(l => l.code)).toEqual(['en', 'de', 'fr', 'it', 'el']);
    setLang('de'); expect(t('Overview')).toBe('Übersicht');
    setLang('fr'); expect(t('Overview')).toBe('Aperçu');
    setLang('it'); expect(t('Overview')).toBe('Panoramica');
    setLang('el'); expect(t('Overview')).toBe('Επισκόπηση');
    setLang('de'); expect(t('Settings')).toBe('Einstellungen');
    setLang('el'); expect(t('Settings')).toBe('Ρυθμίσεις');
  });

  it('interpolates variables', () => {
    setLang('de');
    expect(t('Last backup {n} days ago', { n: 120 })).toBe('Letztes Backup vor 120 Tagen');
    setLang('en');
  });

  it('ignores invalid language codes', () => {
    setLang('xx');
    expect(getLang()).toBe('en');
    setLang('en');
  });
});
