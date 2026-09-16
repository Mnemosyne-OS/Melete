/**
 * schedule.ts — the spaced repetition, which is the only part of a revision app
 * that has to be RIGHT rather than pretty.
 *
 * Leitner boxes, five of them, because the alternative (SM-2 with per-card ease
 * factors) needs a quality rating from 0 to 5 that students do not give
 * honestly and that we cannot show without turning a review into a form. Boxes
 * take one bit — did you know it — and that bit is the one a student answers
 * truthfully.
 *
 * 🚨 A missed card falls to box 1, not to `box - 1`. Half-forgetting is not a
 * thing: if the answer did not come, the interval that produced that gap was
 * wrong, and stepping it down by one repeats the same near-miss next week.
 */
import type { Card, LeitnerBox } from './types';
import { addDays, dayKey } from './day';

/** Days a card rests after landing in each box. Box 1 rests zero days: a card
 *  you just missed comes back in the SAME session, which is where re-learning
 *  actually happens. */
export const BOX_DAYS: Record<LeitnerBox, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };

export const MAX_BOX: LeitnerBox = 5;

/** A fresh card: due immediately, never seen. */
export function newCard(init: Pick<Card, 'id' | 'courseId' | 'front' | 'back'> & { quote?: string }, now: Date): Card {
  return {
    id: init.id,
    courseId: init.courseId,
    front: init.front,
    back: init.back,
    ...(init.quote ? { quote: init.quote } : {}),
    box: 1,
    dueAt: dayKey(now),
    reps: 0,
    lapses: 0,
    lastSeenAt: null,
  };
}

/**
 * Applies one answer. Pure: returns a new card, never mutates.
 *
 * A hit promotes one box (capped at 5) and pushes the due date out by that
 * box's rest. A miss drops to box 1 and counts a lapse — the lapse count is
 * what later tells a student which cards are actually hard, as opposed to
 * which ones they have merely seen often.
 */
export function answerCard(card: Card, correct: boolean, now: Date): Card {
  const box: LeitnerBox = correct
    ? (Math.min(card.box + 1, MAX_BOX) as LeitnerBox)
    : 1;
  return {
    ...card,
    box,
    dueAt: addDays(dayKey(now), BOX_DAYS[box]),
    reps: card.reps + 1,
    lapses: card.lapses + (correct ? 0 : 1),
    lastSeenAt: now.toISOString(),
  };
}

/** Cards whose rest is over, oldest due first, then hardest (most lapses). */
export function dueCards(cards: Card[], now: Date): Card[] {
  const today = dayKey(now);
  return cards
    .filter((c) => c.dueAt <= today)
    .sort((a, b) => (a.dueAt === b.dueAt ? b.lapses - a.lapses : a.dueAt < b.dueAt ? -1 : 1));
}

/**
 * How many cards come back on each of the next `days` days, today included.
 *
 * Cards already overdue are counted on day 0 — that is what a student sees
 * when they open the app, and splitting them out as "late" on a forecast makes
 * the first bar lie about the size of today's session.
 */
export function forecast(cards: Card[], now: Date, days: number): { day: string; count: number }[] {
  const today = dayKey(now);
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const count = cards.filter((c) => (i === 0 ? c.dueAt <= day : c.dueAt === day)).length;
    out.push({ day, count });
  }
  return out;
}

/** Share of a deck that has reached the last box — the honest "learned" number.
 *  Returns null for an EMPTY deck: no cards is an unknown mastery, not 0 %. */
export function masteryPct(cards: Card[]): number | null {
  if (cards.length === 0) return null;
  return Math.round((cards.filter((c) => c.box === MAX_BOX).length / cards.length) * 100);
}
