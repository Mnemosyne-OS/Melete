import { describe, expect, it } from 'vitest';
import { estimateWidth, formatBytes, safeFileName, wrapLabel } from './text';

describe('wrapLabel', () => {
  it('leaves a short label on one line', () => {
    expect(wrapLabel('Sources of law', 20)).toEqual(['Sources of law']);
  });

  it('breaks on spaces, never inside a word', () => {
    const lines = wrapLabel('hierarchy of legal norms', 12);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(13); // 12 + the ellipsis
    expect(lines[0]).toBe('hierarchy of');
  });

  it('elides rather than dropping the tail in silence', () => {
    const lines = wrapLabel('one two three four five six seven eight nine ten', 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
  });

  it('does not elide when everything fitted', () => {
    expect(wrapLabel('one two', 10, 2).join(' ')).toBe('one two');
  });

  it('returns nothing for an empty label', () => {
    expect(wrapLabel('   ', 10)).toEqual([]);
  });
});

describe('estimateWidth', () => {
  it('grows with the text and the font size', () => {
    expect(estimateWidth('abcd', 13)).toBeGreaterThan(estimateWidth('ab', 13));
    expect(estimateWidth('abcd', 20)).toBeGreaterThan(estimateWidth('abcd', 13));
  });
});

describe('formatBytes', () => {
  it('names the unit it is using', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('safeFileName', () => {
  it('strips what a filesystem refuses', () => {
    expect(safeFileName('Droit civil: contrats/obligations', 'svg')).toBe('Droit civil contrats obligations.svg');
  });

  it('falls back to a name rather than producing a bare extension', () => {
    expect(safeFileName('///', 'svg')).toBe('melete.svg');
  });
});
