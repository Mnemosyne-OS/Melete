import { describe, expect, it } from 'vitest';
import { measuredWeakness, weakTopics, MIN_MISSES } from './weak';
import type { QuizAttempt } from './types';

const attempt = (missed: string[], courseId = 'k1', at = 'x'): QuizAttempt =>
  ({ quizId: 'q', courseId, at, correct: 1, total: 3, missed });

describe('weakTopics', () => {
  it('is empty when nothing has been attempted', () => {
    expect(weakTopics([], 'k1')).toEqual([]);
  });

  it('IGNORES a topic missed only once — one bad answer is a bad day', () => {
    expect(weakTopics([attempt(['hierarchie'])], 'k1')).toEqual([]);
  });

  it('names a topic missed on two separate attempts', () => {
    const out = weakTopics([attempt(['hierarchie'], 'k1', 'a'), attempt(['hierarchie'], 'k1', 'b')], 'k1');
    expect(out).toEqual([{ topic: 'hierarchie', misses: 2, attempts: 2 }]);
  });

  it('counts an attempt ONCE per topic, however many questions it missed', () => {
    // 🚨 Otherwise a long quiz on one subject outranks a topic failed across
    // four separate sittings — and the second is the one that resists.
    const long = attempt(['sources', 'sources', 'sources'], 'k1', 'a');
    const spread = [
      attempt(['hierarchie'], 'k1', 'b'),
      attempt(['hierarchie'], 'k1', 'c'),
    ];
    const out = weakTopics([long, ...spread], 'k1');
    expect(out.map((w) => w.topic)).toEqual(['hierarchie']);
  });

  it('ranks by how many attempts missed it', () => {
    const out = weakTopics([
      attempt(['a', 'b'], 'k1', '1'),
      attempt(['a', 'b'], 'k1', '2'),
      attempt(['a'], 'k1', '3'),
    ], 'k1');
    expect(out.map((w) => w.topic)).toEqual(['a', 'b']);
    expect(out[0]?.misses).toBe(3);
  });

  it('breaks ties on the name, so the row does not reshuffle on every render', () => {
    const out = weakTopics([attempt(['zeta', 'alpha'], 'k1', '1'), attempt(['zeta', 'alpha'], 'k1', '2')], 'k1');
    expect(out.map((w) => w.topic)).toEqual(['alpha', 'zeta']);
  });

  it('carries the denominator, so the number means something', () => {
    const out = weakTopics([attempt(['x'], 'k1', '1'), attempt(['x'], 'k1', '2'), attempt([], 'k1', '3')], 'k1');
    expect(out[0]).toEqual({ topic: 'x', misses: 2, attempts: 3 });
  });

  it('never reads another course attempts', () => {
    const out = weakTopics([attempt(['x'], 'other', '1'), attempt(['x'], 'other', '2')], 'k1');
    expect(out).toEqual([]);
  });

  it('drops an empty topic instead of showing a nameless weakness', () => {
    expect(weakTopics([attempt([''], 'k1', '1'), attempt([''], 'k1', '2')], 'k1')).toEqual([]);
  });

  it('states its threshold rather than hiding it', () => {
    expect(MIN_MISSES).toBe(2);
  });
});

describe('measuredWeakness', () => {
  it('returns null when nothing was measured', () => {
    // ⛔ An empty sentence in a prompt is worse than no sentence: the model
    // fills the blank.
    expect(measuredWeakness([])).toBeNull();
  });

  it('names the topics with their counts', () => {
    const line = measuredWeakness([{ topic: 'hierarchie', misses: 3, attempts: 4 }]);
    expect(line).toBe('hierarchie (3/4)');
  });

  it('caps at four, so the prompt does not become a list', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ topic: `t${i}`, misses: 2, attempts: 3 }));
    expect(measuredWeakness(many)?.split(',')).toHaveLength(4);
  });
});
