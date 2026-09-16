/**
 * web.ts — letting a page from the internet into a course, without letting it
 * pretend to be the course.
 *
 * ⚖️ This is the feature with a governance rule attached, and the rule is not
 * decoration. Until now, nothing Melete showed came from anywhere but the
 * student's own documents — which is what makes the verbatim excerpt under
 * every card checkable. Web material breaks that unless three things hold, and
 * they are enforced here and in the callers rather than left to good intentions:
 *
 *  1. **The human supplies the URL.** There is no search: `social.fetch` reads
 *     an address it is given. Melete never goes looking, so it can never bring
 *     back a "reliable source" nobody chose. ⛔ And we publish no list of
 *     trusted sites: reliability is not a property we can measure.
 *  2. **A web document is MARKED, everywhere it appears.** Its own kind, its
 *     own chip, its domain next to it.
 *  3. **An exam quiz is never generated from it.** A student who writes back a
 *     source their professor did not give is penalised, and it would be us who
 *     led them there. `courseText({ excludeWeb: true })` is what the quiz uses.
 */
import { invokeHost } from './host';
import { log } from './log';
import type { Course, Doc } from './types';

export type WebFailure = 'BAD_URL' | 'FETCH_FAILED' | 'NO_TEXT';

export type WebResult =
  | { ok: true; title: string; text: string; domain: string; truncated: boolean }
  | { ok: false; code: WebFailure; detail?: string };

/** The host allows HTTPS only (`ONLY_HTTPS_URLS_ALLOWED`); saying so here means
 *  the student is told before the request instead of by an opaque code after. */
export function domainOf(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.hostname : null;
  } catch {
    return null;
  }
}

/**
 * HTML to text, for a page fetched by the host.
 *
 * The host's own `htmlToText` lives in the main process and a cartridge cannot
 * reach it, so this is a second implementation — deliberately, and kept small.
 * Inline tags are removed WITHOUT a space, because an inline tag lives inside a
 * word (`M<sup>me</sup>`) and a space there splits it; block tags become line
 * breaks, because that is what makes paragraphs.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style|nav|footer|aside)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:b|i|em|strong|span|sup|sub|small|a|code|u)(?:\s[^>]*)?>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(+n))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The page's own <title>, or its domain — never an invented name. */
export function titleOf(html: string, domain: string): string {
  const m = /<title[^>]*>([\s\S]{1,200}?)<\/title>/i.exec(html);
  const raw = m?.[1]?.replace(/\s+/g, ' ').trim();
  return raw && raw.length > 2 ? raw : domain;
}

export async function fetchPage(rawUrl: string): Promise<WebResult> {
  const domain = domainOf(rawUrl);
  if (!domain) return { ok: false, code: 'BAD_URL' };

  try {
    const res = await invokeHost<{
      status?: number; body?: string; truncated?: boolean; contentType?: string;
    }>('social.fetch', { url: rawUrl.trim() });
    const body = res?.body ?? '';
    if (!body) return { ok: false, code: 'FETCH_FAILED', detail: `HTTP ${res?.status ?? '?'}` };

    const text = htmlToText(body);
    log.info('web', 'page read', { domain, html: body.length, text: text.length, truncated: res?.truncated === true });
    if (text.length < 200) return { ok: false, code: 'NO_TEXT' };

    return { ok: true, title: titleOf(body, domain), text, domain, truncated: res?.truncated === true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn('web', 'fetch failed', { domain, detail });
    return { ok: false, code: 'FETCH_FAILED', detail };
  }
}

/** True for a document that came from the internet rather than from the course. */
export function isWeb(doc: Doc): boolean {
  return doc.sourceKind === 'web';
}

/** Does this binder mix its own documents with material from the web? */
export function hasWebSources(course: Course): boolean {
  return course.docs.some(isWeb);
}
