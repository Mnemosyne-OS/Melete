import { describe, expect, it } from 'vitest';
import { chunkText, modelSlice, preview } from './chunk';

describe('chunkText', () => {
  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('leaves a short text whole', () => {
    expect(chunkText('one paragraph', 100)).toEqual(['one paragraph']);
  });

  it('covers the whole text — every word ends up in some chunk', () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const joined = chunkText(text, 200).join(' ');
    for (const w of words) expect(joined).toContain(w);
  });

  it('never emits a chunk longer than the size it was given', () => {
    const text = Array.from({ length: 200 }, (_, i) => `sentence number ${i}.`).join(' ');
    for (const c of chunkText(text, 300)) expect(c.length).toBeLessThanOrEqual(300);
  });

  it('terminates on a single huge paragraph with no break to find', () => {
    const wall = 'x'.repeat(5000);
    const chunks = chunkText(wall, 400);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join('').length).toBeGreaterThanOrEqual(5000);
  });

  it('prefers a paragraph break to a hard cut', () => {
    const a = 'a'.repeat(150);
    const b = 'b'.repeat(150);
    const chunks = chunkText(`${a}\n\n${b}`, 200);
    expect(chunks[0]).toBe(a);
  });
});

describe('modelSlice', () => {
  it('reports a short text as complete', () => {
    expect(modelSlice('short', 100)).toEqual({ text: 'short', complete: true });
  });

  it('reports a cut text as incomplete — the UI shows that', () => {
    const long = 'word '.repeat(500);
    const res = modelSlice(long, 200);
    expect(res.complete).toBe(false);
    expect(res.text.length).toBeLessThanOrEqual(200);
  });
});

describe('preview', () => {
  it('flattens whitespace and elides', () => {
    expect(preview('a\n\n  b   c', 40)).toBe('a b c');
    expect(preview('x'.repeat(100), 10).endsWith('…')).toBe(true);
  });
});
