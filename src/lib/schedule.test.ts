import { describe, expect, it } from 'vitest';
import { answerCard, dueCards, forecast, masteryPct, newCard, BOX_DAYS } from './schedule';
import { dayKey } from './day';
import type { Card } from './types';

const AT = new Date(2026, 8, 1, 10, 0, 0); // 1 Sept 2026, local

function make(over: Partial<Card> = {}): Card {
  return { ...newCard({ id: 'c1', courseId: 'k1', front: 'q', back: 'a' }, AT), ...over };
}

describe('answerCard', () => {
  it('promotes one box on a hit and rests for that box', () => {
    const card = answerCard(make({ box: 2 }), true, AT);
    expect(card.box).toBe(3);
    expect(card.dueAt).toBe('2026-09-04'); // +3 days
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
  });

  it('caps at box 5 rather than climbing past it', () => {
    expect(answerCard(make({ box: 5 }), true, AT).box).toBe(5);
    expect(answerCard(make({ box: 5 }), true, AT).dueAt).toBe('2026-09-22'); // +21
  });

  it('drops a miss to box 1, not to box - 1', () => {
    const card = answerCard(make({ box: 4 }), false, AT);
    expect(card.box).toBe(1);
    expect(card.lapses).toBe(1);
    // Box 1 rests zero days, so the card is due the same day and comes back
    // in this sitting.
    expect(card.dueAt).toBe(dayKey(AT));
  });

  it('never mutates the card it was given', () => {
    const before = make({ box: 2 });
    const snapshot = { ...before };
    answerCard(before, true, AT);
    expect(before).toEqual(snapshot);
  });

  it('records the moment of the answer', () => {
    expect(answerCard(make(), true, AT).lastSeenAt).toBe(AT.toISOString());
  });
});

describe('dueCards', () => {
  it('returns only what has finished resting', () => {
    const cards = [
      make({ id: 'past', dueAt: '2026-08-30' }),
      make({ id: 'today', dueAt: '2026-09-01' }),
      make({ id: 'future', dueAt: '2026-09-05' }),
    ];
    expect(dueCards(cards, AT).map((c) => c.id)).toEqual(['past', 'today']);
  });

  it('puts the hardest card first among cards due the same day', () => {
    const cards = [
      make({ id: 'easy', dueAt: '2026-09-01', lapses: 0 }),
      make({ id: 'hard', dueAt: '2026-09-01', lapses: 4 }),
    ];
    expect(dueCards(cards, AT).map((c) => c.id)).toEqual(['hard', 'easy']);
  });
});

describe('forecast', () => {
  it('counts everything overdue on day zero rather than hiding it', () => {
    const cards = [
      make({ dueAt: '2026-08-01' }),
      make({ dueAt: '2026-08-30' }),
      make({ dueAt: '2026-09-01' }),
      make({ dueAt: '2026-09-03' }),
    ];
    const bars = forecast(cards, AT, 4);
    expect(bars[0]).toEqual({ day: '2026-09-01', count: 3 });
    expect(bars[2]).toEqual({ day: '2026-09-03', count: 1 });
    expect(bars).toHaveLength(4);
  });
});

describe('masteryPct', () => {
  it('is null for a deck with no cards — an unknown, not a zero', () => {
    expect(masteryPct([])).toBeNull();
  });

  it('counts only the last box', () => {
    expect(masteryPct([make({ box: 5 }), make({ box: 4 }), make({ box: 5 }), make({ box: 1 })])).toBe(50);
  });
});

describe('BOX_DAYS', () => {
  it('rests box 1 for zero days so a missed card returns in the same sitting', () => {
    expect(BOX_DAYS[1]).toBe(0);
  });
});
