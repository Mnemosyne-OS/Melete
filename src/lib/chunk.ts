/**
 * chunk.ts — cutting a course into pieces memory can hold.
 *
 * Two different consumers, two different sizes, and conflating them is a real
 * bug: the VAULT wants small self-contained passages so retrieval returns a
 * paragraph and not a chapter, while the MODEL wants the largest slice its
 * context can take. So this module exposes the cut, and each caller says how
 * big it needs the pieces.
 */

/** The host caps one `mnemosyne.ingest` payload at 50 000 characters and
 *  silently slices past it. Staying well under that is not politeness: a
 *  chronicle cut mid-sentence retrieves badly for the rest of its life. */
export const INGEST_CHUNK_CHARS = 1400;

/** Overlap between consecutive chunks, so a definition that straddles a cut is
 *  whole in at least one of them. */
const OVERLAP_CHARS = 120;

/**
 * Splits on the largest boundary that fits: paragraph, then sentence, then a
 * hard cut. The hard cut exists because some course PDFs really are one
 * 40 000-character paragraph, and refusing to ingest those would mean the app
 * works on tidy documents only.
 */
export function chunkText(text: string, size = INGEST_CHUNK_CHARS): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const out: string[] = [];
  let cursor = 0;

  while (cursor < clean.length) {
    const hardEnd = Math.min(cursor + size, clean.length);
    let end = hardEnd;

    if (hardEnd < clean.length) {
      const window = clean.slice(cursor, hardEnd);
      // Look for a break in the last third — earlier than that and the chunks
      // become so uneven that the overlap stops covering anything.
      const floor = Math.floor(window.length * 0.6);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('.\n'),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
      );
      if (para > floor) end = cursor + para;
      else if (sentence > floor) end = cursor + sentence + 1;
    }

    const piece = clean.slice(cursor, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }

  return out;
}

/**
 * The slice of a course handed to the model.
 *
 * It is a HEAD slice and not a sample of the whole document, and that is a
 * deliberate limitation with a visible consequence: everything generated from a
 * long course describes its beginning. The UI says so rather than letting a
 * student believe a 400-page textbook produced a 12-card deck that covers it.
 */
export function modelSlice(text: string, budget: number): { text: string; complete: boolean } {
  const clean = text.trim();
  if (clean.length <= budget) return { text: clean, complete: true };
  const cut = clean.slice(0, budget);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '));
  return { text: lastBreak > budget * 0.6 ? cut.slice(0, lastBreak + 1) : cut, complete: false };
}

/** A short, human-readable preview — the line under a course in the library. */
export function preview(text: string, chars = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= chars ? flat : `${flat.slice(0, chars).trimEnd()}…`;
}
