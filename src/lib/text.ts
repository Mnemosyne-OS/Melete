/**
 * text.ts — the small measurements the SVG surfaces need.
 *
 * SVG has no text layout: a `<text>` element is one line, forever, and it
 * overflows its box in silence. Everything drawn on the map or the schema
 * therefore has to be wrapped and measured HERE, before it is drawn.
 *
 * The width estimate is deliberately an over-estimate (0.58em per character
 * against an average nearer 0.5em for Inter): a box slightly too wide is
 * invisible, a box slightly too narrow cuts a word in half.
 */

/** Approximate rendered width of a string, in px, at a given font size. */
export function estimateWidth(s: string, fontSize: number): number {
  return s.length * fontSize * 0.58;
}

/**
 * Wraps a label into at most `maxLines` lines of at most `maxChars`, breaking
 * on spaces. The last line is elided rather than dropped, so a long label
 * ends in "…" instead of ending mid-word as if the data were truncated.
 */
export function wrapLabel(label: string, maxChars: number, maxLines = 2): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length;
    if (consumed < label.length) {
      const last = lines[maxLines - 1] ?? '';
      lines[maxLines - 1] = last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    }
  }
  return lines;
}

/** Human byte size. Used for the storage budget, where the number is the point. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** A filename that will survive every filesystem this app runs on. */
export function safeFileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${base || 'melete'}.${ext}`;
}
