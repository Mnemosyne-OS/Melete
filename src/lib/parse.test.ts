import { describe, expect, it } from 'vitest';
import { asCards, asMindMap, asQuiz, asSketch, parseLoose } from './parse';

const NOW = new Date(2026, 8, 1);

describe('parseLoose', () => {
  it('reads plain JSON', () => {
    expect(parseLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('reads JSON inside a fence', () => {
    expect(parseLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLoose('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('reads JSON after a sentence of preamble', () => {
    expect(parseLoose('Here is your map:\n{"a":1}\nHope this helps!')).toEqual({ a: 1 });
  });

  it('repairs a trailing comma', () => {
    expect(parseLoose('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  it('returns null rather than guessing at real garbage', () => {
    expect(parseLoose('I cannot help with that.')).toBeNull();
    expect(parseLoose('')).toBeNull();
    expect(parseLoose('{"a": ')).toBeNull();
  });
});

describe('asMindMap', () => {
  it('builds a map from the expected shape', () => {
    const doc = asMindMap({ title: 'Sources of law', root: { label: 'Law', children: [{ label: 'Statute' }, { label: 'Case law' }] } }, 'k1', NOW);
    expect(doc?.title).toBe('Sources of law');
    expect(doc?.root.children).toHaveLength(2);
  });

  it('refuses a root with no branches — that is a title, not a map', () => {
    expect(asMindMap({ root: { label: 'Law' } }, 'k1', NOW)).toBeNull();
  });

  it('refuses a shape with no label anywhere', () => {
    expect(asMindMap({ root: { children: [{ label: 'a' }] } }, 'k1', NOW)).toBeNull();
    expect(asMindMap(null, 'k1', NOW)).toBeNull();
  });

  it('stops descending past the readable depth instead of drawing a hairball', () => {
    const deep = { label: 'l0', children: [{ label: 'l1', children: [{ label: 'l2', children: [{ label: 'l3', children: [{ label: 'l4', children: [{ label: 'l5' }] }] }] }] }] };
    const doc = asMindMap({ root: deep }, 'k1', NOW);
    const depthOf = (n: { children?: unknown[] } | undefined, d = 0): number =>
      n?.children?.length ? depthOf(n.children[0] as { children?: unknown[] }, d + 1) : d;
    expect(depthOf(doc?.root)).toBeLessThanOrEqual(4);
  });

  it('gives every node its own id so React can key them', () => {
    const doc = asMindMap({ root: { label: 'r', children: [{ label: 'a' }, { label: 'a' }] } }, 'k1', NOW);
    const ids = (doc?.root.children ?? []).map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('asQuiz', () => {
  const q = (over: Record<string, unknown> = {}) => ({
    prompt: 'Which article?', choices: ['544', '1102'], answer: 0, ...over,
  });

  it('accepts a well-formed question', () => {
    const quiz = asQuiz({ questions: [q(), q()] }, 'k1', NOW);
    expect(quiz?.questions).toHaveLength(2);
  });

  it('drops a question whose answer index is outside its choices', () => {
    // A quiz nobody can pass is worse than one question short.
    expect(asQuiz({ questions: [q({ answer: 7 }), q(), q()] }, 'k1', NOW)?.questions).toHaveLength(2);
    expect(asQuiz({ questions: [q({ answer: -1 }), q(), q()] }, 'k1', NOW)?.questions).toHaveLength(2);
  });

  it('drops a question with a single choice — that is a statement', () => {
    expect(asQuiz({ questions: [q({ choices: ['only one'] }), q(), q()] }, 'k1', NOW)?.questions).toHaveLength(2);
  });

  it('returns null when fewer than two questions survive', () => {
    expect(asQuiz({ questions: [q()] }, 'k1', NOW)).toBeNull();
    expect(asQuiz({ questions: [] }, 'k1', NOW)).toBeNull();
  });

  it('reads a bare array as well as a wrapped object', () => {
    expect(asQuiz([q(), q()], 'k1', NOW)?.questions).toHaveLength(2);
  });
});

describe('asCards', () => {
  it('keeps only cards with both sides', () => {
    const cards = asCards({ cards: [{ front: 'a', back: 'b' }, { front: 'c' }, { back: 'd' }] }, 'k1');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ front: 'a', back: 'b', courseId: 'k1' });
  });

  it('accepts question/answer as well as front/back', () => {
    expect(asCards([{ question: 'q', answer: 'a' }], 'k1')).toHaveLength(1);
  });

  it('is empty, not null, for junk — the caller decides what empty means', () => {
    expect(asCards('nope', 'k1')).toEqual([]);
  });
});

describe('asSketch', () => {
  it('pads a comparison row that is short a cell rather than leaving a gap', () => {
    const doc = asSketch(
      { items: ['A', 'B', 'C'], rows: [{ label: 'form', cells: ['written'] }] },
      'compare', 'k1', NOW,
    );
    expect(doc?.table?.rows[0]?.cells).toEqual(['written', '—', '—']);
  });

  it('refuses a comparison of one thing', () => {
    expect(asSketch({ items: ['A'], rows: [{ label: 'x', cells: ['y'] }] }, 'compare', 'k1', NOW)).toBeNull();
  });

  it('refuses a one-step process and a one-event chronology', () => {
    expect(asSketch({ steps: [{ label: 'only' }] }, 'flow', 'k1', NOW)).toBeNull();
    expect(asSketch({ events: [{ when: '1804', label: 'code' }] }, 'timeline', 'k1', NOW)).toBeNull();
  });

  it('keeps a branch only when both exits are named', () => {
    const doc = asSketch(
      { steps: [{ label: 'a', branch: { yes: 'go' } }, { label: 'b', branch: { yes: 'go', no: 'stop' } }] },
      'flow', 'k1', NOW,
    );
    expect(doc?.steps?.[0]?.branch).toBeUndefined();
    expect(doc?.steps?.[1]?.branch).toEqual({ yes: 'go', no: 'stop' });
  });

  it('copies "when" verbatim instead of parsing it as a date', () => {
    const doc = asSketch({ events: [{ when: '3rd century BC', label: 'a' }, { when: 'phase II', label: 'b' }] }, 'timeline', 'k1', NOW);
    expect(doc?.events?.map((e) => e.when)).toEqual(['3rd century BC', 'phase II']);
  });
});
