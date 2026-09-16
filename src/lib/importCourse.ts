/**
 * importCourse.ts — the pipeline from "a file on disk" to "a document inside a
 * course".
 *
 * Since v2 an import produces a **Doc**, not a Course: a course is a binder and
 * a binder is filled several times. The order of operations is the interesting
 * part, and what each step is allowed to claim:
 *
 *   pick → extract (OCR if needed) → make the document → file passages into
 *   the vault → count what actually landed.
 *
 * 🎭 The count at the end is a MEASURE, not the number of chunks we tried to
 * write. If the vault refused half of them, the document says so, and `chunks`
 * stays `null` when nothing could be counted at all. A document showing "38
 * passages" that has none is how a student later concludes the recall is
 * broken, when what broke was the import.
 */
import { chunkText, INGEST_CHUNK_CHARS } from './chunk';
import { extractDocument, ingestPassage, pickFile, readFile, saveImage, type OcrProgress } from './host';
import { newId } from './id';
import { log } from './log';
import { fetchPage } from './web';
import type { Course, Doc, SourceKind } from './types';

/** How much source text a document keeps for regeneration. Roughly two model
 *  slices, so one long generation and one retry fit without re-reading the
 *  file — and small enough that a binder of several documents still fits. */
export const RETAIN_CHARS = 24_000;

export type ImportPhase =
  | { k: 'picking' }
  | { k: 'reading' }
  | { k: 'ocr'; page: number; pages: number }
  | { k: 'ocrQueued' }
  | { k: 'savingImage' }
  | { k: 'ingesting'; done: number; total: number };

export type ImportError =
  /** The user closed the picker. Not an error — the caller shows nothing. */
  | { code: 'CANCELLED' }
  /** The host could not read the file; `detail` is its own words. */
  | { code: 'READ_FAILED'; detail: string; looksLikeScan: boolean }
  /** It was read, and there was no text in it. */
  | { code: 'NO_TEXT' };

export interface ImportOk {
  doc: Doc;
  /** Passages the vault accepted, or null when none could be counted. */
  ingested: number | null;
  /** Passages Melete tried to write. `attempted > ingested` is worth saying. */
  attempted: number;
  /** Present when the picture was saved but its indexing is not ours to promise. */
  imageSaved?: boolean;
}

export type ImportResult = { ok: true; value: ImportOk } | { ok: false; error: ImportError };

const DOC_FILTERS = [{ name: 'Course', extensions: ['pdf', 'docx', 'txt', 'md', 'rtf', 'epub'] }];
const IMAGE_FILTERS = [{ name: 'Picture', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }];

/** The host says an image or scan needs OCR in its own words; this is the one
 *  place that decides the message deserves the "install an OCR engine" hint. */
function looksLikeScan(message: string): boolean {
  return /ocr|scan|no text found in image/i.test(message);
}

/** A pasted document with no name borrows its first words — and SAYS it was cut,
 *  rather than showing a name that stops mid-word as if the paste had failed. */
function nameFromText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 40 ? flat : `${flat.slice(0, 40).trimEnd()}…`;
}

/** An empty binder, waiting for its first document. */
export function newCourse(title: string, subject: string, now: Date): Course {
  return {
    id: newId('course'),
    title: title.trim(),
    subject: subject.trim(),
    // Proposed by the plan step, or typed by the human. Never guessed here.
    teacher: '',
    level: '',
    docs: [],
    plan: null,
    intent: null,
    createdAt: now.toISOString(),
  };
}

function baseDoc(init: {
  name: string;
  sourceKind: SourceKind;
  sourcePath: string | null;
  text: string;
  ocr: boolean;
  truncated: boolean;
  encoding?: string | undefined;
  now: Date;
}): Doc {
  return {
    id: newId('doc'),
    name: init.name,
    sourceKind: init.sourceKind,
    sourcePath: init.sourcePath,
    chars: init.text.length,
    ocr: init.ocr,
    truncated: init.truncated,
    ...(init.encoding ? { encoding: init.encoding } : {}),
    chunks: null,
    ingestedAt: null,
    addedAt: init.now.toISOString(),
    retained: init.text.slice(0, RETAIN_CHARS),
  };
}

/**
 * Writes a document's text into Melete's vault, one passage at a time.
 *
 * Sequential on purpose: the host embeds each chronicle as it arrives, and
 * firing forty at once buys nothing but a queue the user cannot see the end of.
 * The `sourceRef` names the COURSE, so asking a question later reaches every
 * document of the binder at once.
 */
export async function fileIntoVault(
  vault: string,
  courseId: string,
  doc: Doc,
  text: string,
  onPhase: (p: ImportPhase) => void,
): Promise<{ ingested: number | null; attempted: number }> {
  const chunks = chunkText(text, INGEST_CHUNK_CHARS);
  if (!chunks.length) return { ingested: null, attempted: 0 };

  log.info('ingest', 'filing a document into the vault', {
    vault, course: courseId, doc: doc.id, chars: text.length, chunks: chunks.length,
  });

  let ok = 0;
  let failures = 0;
  for (let i = 0; i < chunks.length; i++) {
    onPhase({ k: 'ingesting', done: i, total: chunks.length });
    try {
      await ingestPassage(vault, `${doc.name}\n\n${chunks[i] ?? ''}`, `melete:course:${courseId}`);
      ok++;
    } catch (err) {
      failures++;
      log.warn('ingest', `passage ${i + 1}/${chunks.length} refused by the vault`, {
        detail: err instanceof Error ? err.message : String(err),
      });
      // Three refusals in a row is a broken vault, not a bad passage. Stopping
      // keeps the count honest instead of grinding through forty failures.
      if (failures >= 3 && ok === 0) {
        log.error('ingest', 'three refusals and nothing accepted — stopping', { attempted: i + 1 });
        break;
      }
    }
  }
  log.info('ingest', 'done', { accepted: ok, attempted: chunks.length, refused: failures });
  return { ingested: ok > 0 ? ok : null, attempted: chunks.length };
}

async function finish(
  vault: string, courseId: string, doc: Doc, text: string,
  onPhase: (p: ImportPhase) => void, now: Date, imageSaved?: boolean,
): Promise<ImportResult> {
  const filed = await fileIntoVault(vault, courseId, doc, text, onPhase);
  return {
    ok: true,
    value: {
      doc: { ...doc, chunks: filed.ingested, ingestedAt: filed.ingested ? now.toISOString() : null },
      ...filed,
      ...(imageSaved === undefined ? {} : { imageSaved }),
    },
  };
}

/** Import a document the user picks (PDF, Word, text, EPUB). */
export async function importDocument(
  vault: string, courseId: string, onPhase: (p: ImportPhase) => void, now: Date,
): Promise<ImportResult> {
  onPhase({ k: 'picking' });
  const picked = await pickFile(DOC_FILTERS);
  if (!picked) return { ok: false, error: { code: 'CANCELLED' } };

  onPhase({ k: 'reading' });
  const res = await extractDocument(picked.path, { onProgress: (p) => onPhase(ocrPhase(p)) });
  if (!res.success) {
    const detail = res.error ?? 'UNKNOWN';
    return { ok: false, error: { code: 'READ_FAILED', detail, looksLikeScan: looksLikeScan(detail) } };
  }
  const text = (res.data?.text ?? '').trim();
  log.info('import', 'document read', {
    file: picked.name, chars: text.length, encoding: res.data?.encoding ?? null,
    ocr: res.data?.ocrUsed === true, cutByHost: res.data?.truncated === true,
  });
  if (!text) {
    log.warn('import', 'the host returned no text at all', { file: picked.name });
    return { ok: false, error: { code: 'NO_TEXT' } };
  }

  const doc = baseDoc({
    name: picked.name.replace(/\.[a-z0-9]+$/i, ''),
    sourceKind: 'file',
    sourcePath: picked.path,
    text,
    ocr: res.data?.ocrUsed === true,
    truncated: res.data?.truncated === true,
    encoding: res.data?.encoding,
    now,
  });
  return finish(vault, courseId, doc, text, onPhase, now);
}

/**
 * Import a photo of a lecture screen.
 *
 * Two things happen and they are independent, which is why they are reported
 * separately: the PICTURE is saved into Melete's vault (where DocWatch will
 * pick it up), and the TEXT on it is read by OCR. The first works with no OCR
 * engine installed; the second does not, and a photo that saved but could not
 * be read is a real, common outcome — not a failed import.
 */
export async function importPhoto(
  vault: string, courseId: string, onPhase: (p: ImportPhase) => void, now: Date,
): Promise<ImportResult> {
  onPhase({ k: 'picking' });
  const picked = await pickFile(IMAGE_FILTERS);
  if (!picked) return { ok: false, error: { code: 'CANCELLED' } };

  onPhase({ k: 'savingImage' });
  let imageSaved = false;
  try {
    const file = await readFile(picked.path);
    const dataUrl = file.content ?? '';
    const comma = dataUrl.indexOf(',');
    const base64 = file.isBinary && comma !== -1 ? dataUrl.slice(comma + 1) : '';
    if (base64) {
      const saved = await saveImage(picked.name, base64);
      imageSaved = saved?.success !== false;
    }
  } catch (err) {
    // The picture not landing must not abort the OCR half: reading the board
    // is what the student came for, and the two are genuinely independent.
    log.warn('import', 'the picture could not be saved into the vault', {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  onPhase({ k: 'reading' });
  const res = await extractDocument(picked.path, { forceOcr: true, onProgress: (p) => onPhase(ocrPhase(p)) });
  const text = res.success ? (res.data?.text ?? '').trim() : '';
  if (!text) {
    const detail = res.error ?? '';
    // The picture IS in the vault even when nothing could be read from it, so
    // this is only a failure of the text half — the caller says both.
    return {
      ok: false,
      error: detail
        ? { code: 'READ_FAILED', detail, looksLikeScan: looksLikeScan(detail) }
        : { code: 'NO_TEXT' },
    };
  }

  const doc = baseDoc({
    name: picked.name.replace(/\.[a-z0-9]+$/i, ''),
    sourceKind: 'photo',
    sourcePath: picked.path,
    text,
    ocr: true,
    truncated: res.data?.truncated === true,
    now,
  });
  return finish(vault, courseId, doc, text, onPhase, now, imageSaved);
}

/** Import text the student pasted. No file behind it — say so when it matters. */
export async function importPaste(
  vault: string, courseId: string, name: string, raw: string,
  onPhase: (p: ImportPhase) => void, now: Date,
): Promise<ImportResult> {
  const text = raw.trim();
  if (!text) return { ok: false, error: { code: 'NO_TEXT' } };

  const doc = baseDoc({
    name: name.trim() || nameFromText(text),
    sourceKind: 'paste',
    sourcePath: null,
    text,
    ocr: false,
    truncated: false,
    now,
  });
  return finish(vault, courseId, doc, text, onPhase, now);
}

/**
 * Import a web page the student pointed at.
 *
 * ⚖️ The address comes from the human and from nowhere else — Melete has no
 * search, so it can never fetch a page nobody chose. The document it produces
 * is marked `web` for the rest of its life, and the quiz generator refuses it
 * (lib/web.ts explains why).
 */
export async function importWeb(
  vault: string, courseId: string, url: string,
  onPhase: (p: ImportPhase) => void, now: Date,
): Promise<ImportResult> {
  onPhase({ k: 'reading' });
  const res = await fetchPage(url);
  if (!res.ok) {
    return {
      ok: false,
      error: res.code === 'NO_TEXT'
        ? { code: 'NO_TEXT' }
        : { code: 'READ_FAILED', detail: res.detail ?? res.code, looksLikeScan: false },
    };
  }

  const doc = baseDoc({
    name: res.title,
    sourceKind: 'web',
    // The URL is the "path": it is what re-reading would use, and what the
    // screen shows next to the document so its origin is never in doubt.
    sourcePath: url.trim(),
    text: res.text,
    ocr: false,
    truncated: res.truncated,
    now,
  });
  return finish(vault, courseId, doc, res.text, onPhase, now);
}

/** Re-reads a document's file to get its text back after the budget released it. */
export async function rereadSource(doc: Doc): Promise<string | null> {
  if (!doc.sourcePath) return null;
  // A web document is re-read over the network, not off the disk.
  if (doc.sourceKind === 'web') {
    const res = await fetchPage(doc.sourcePath);
    return res.ok ? res.text : null;
  }
  const res = await extractDocument(doc.sourcePath, { forceOcr: doc.ocr });
  const text = res.success ? (res.data?.text ?? '').trim() : '';
  return text || null;
}

function ocrPhase(p: OcrProgress): ImportPhase {
  const page = typeof p.page === 'number' ? p.page : 0;
  const pages = typeof p.pages === 'number' ? p.pages : 0;
  // A frame with no page numbers means the host is telling us about a document
  // that is not ours yet — the honest reading is "queued", not "page 0 of 0".
  return page > 0 && pages > 0 ? { k: 'ocr', page, pages } : { k: 'ocrQueued' };
}
