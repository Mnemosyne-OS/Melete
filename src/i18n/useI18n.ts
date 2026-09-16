/**
 * useI18n — Melete's translation hook, one JSON per language.
 *
 * The language FOLLOWS Mnemosyne OS: the host already hands it to every
 * cartridge iframe, so nothing new is needed host-side.
 *   1. boot   — `?lang=xx` on the entrypoint URL (PluginWidget + standalone).
 *   2. live   — `MNEMO_CONFIG_UPDATE` when the user switches language in the
 *               shell, so Melete re-renders without a reload.
 *   3. fallback — the browser locale, then 'en'.
 *
 * The cartridge cannot read the host's localStorage (different origin), so the
 * query param and the message ARE the contract — do not invent a local setting.
 */
import { useEffect, useState } from 'react';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

export type LangCode = 'en' | 'fr' | 'es';

/** BCP-47 tag for Date#toLocaleString, so generated dates are not stuck in
 *  English for FR/ES students. */
export function dateLocale(lang: LangCode): string {
  return lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US';
}

const BUNDLES: Record<LangCode, Record<string, unknown>> = { en, fr, es };

/** Keeps `<html lang>` on the real language — a screen reader picks its
 *  pronunciation from it, and index.html can only ship one value. */
function syncDocumentLang(lang: LangCode): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

function isLang(v: unknown): v is LangCode {
  return v === 'en' || v === 'fr' || v === 'es';
}

function initialLang(): LangCode {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (isLang(q)) return q;
    const nav = navigator.language.slice(0, 2);
    if (isLang(nav)) return nav;
  } catch {
    // Sandboxed iframe with an opaque location — fall through to English.
  }
  return 'en';
}

let _lang: LangCode = initialLang();
syncDocumentLang(_lang);
const _listeners = new Set<() => void>();

export function getLang(): LangCode { return _lang; }

export function setLang(lang: LangCode): void {
  if (lang === _lang) return;
  _lang = lang;
  syncDocumentLang(lang);
  _listeners.forEach((fn) => fn());
}

/** Take the shell's language, if it is one Melete actually ships. An unknown
 *  locale is IGNORED — leaving the user on what they are already reading beats
 *  switching them to English. */
export function adoptHostLang(lang: unknown): void {
  if (isLang(lang)) setLang(lang);
}

/** Resolve "a.b.c" against a bundle; returns null when absent. */
function lookup(bundle: Record<string, unknown>, path: string): string | null {
  let cur: unknown = bundle;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : null;
}

/**
 * Translate a key. Missing keys fall back to English, then to the key itself —
 * visibly wrong rather than silently blank, so a gap is caught in review.
 */
export function translate(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(BUNDLES[_lang], key) ?? lookup(BUNDLES.en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Subscribe a component to language changes. */
export function useI18n(): { t: typeof translate; lang: LangCode } {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return { t: translate, lang: _lang };
}
