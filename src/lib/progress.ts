/**
 * progress.ts — experience, level, streak and badges.
 *
 * Gamification is where a study app is most tempted to lie, so this module has
 * one rule: **every number shown to a student is recomputed from what they
 * actually did.** Nothing here trusts a stored total.
 *
 * 🚨 The streak in particular is derived from the list of days, against TODAY —
 * never read back from a stored `streak` field. A stored streak is only true on
 * the day it was written; open the app a week later and it happily shows the
 * seven-day run that is already broken.
 */
import type { MeleteState, Progress } from './types';
import { addDays, dayKey } from './day';
import { MAX_BOX } from './schedule';

/** What each act of revision is worth. Small numbers on purpose: the point is
 *  to make an ordinary session feel counted, not to make one import feel like
 *  a week of work. */
export const XP = {
  importCourse: 25,
  generate: 10,
  reviewCard: 2,
  quizCorrect: 5,
  finishQuiz: 15,
} as const;

/** Cumulative XP needed to REACH level `n` (level 1 starts at 0). */
export function xpForLevel(n: number): number {
  if (n <= 1) return 0;
  const k = n - 1;
  return 100 * k + 30 * k * (k - 1);
}

export interface LevelView {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans, so `into / span` is the bar. */
  span: number;
}

export function levelFromXp(xp: number): LevelView {
  const safe = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  // 200 is a ceiling, not a rule: it stops a corrupted xp value from spinning
  // the loop, and no real student reaches it (level 200 is ~1.2M XP).
  while (level < 200 && safe >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: safe - base, span: Math.max(1, next - base) };
}

/**
 * Consecutive days of revision ending today or yesterday.
 *
 * Yesterday counts: a student who revised last night and opens the app at 9am
 * has not broken anything yet, and showing them a 0 would be both wrong and
 * discouraging. A gap of two days or more is a real break and returns 0.
 */
export function streakFrom(days: string[], now: Date): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  const today = dayKey(now);
  const start = set.has(today) ? today : set.has(addDays(today, -1)) ? addDays(today, -1) : null;
  if (!start) return 0;
  let streak = 0;
  let cursor = start;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Records that something happened today, and adds xp. Pure. */
export function credit(progress: Progress, xp: number, now: Date): Progress {
  const today = dayKey(now);
  const days = progress.days.includes(today) ? progress.days : [...progress.days, today];
  // 400 days is roughly an academic career; the tail is only read by the streak
  // and the heat strip, and an unbounded array is how a 256KB budget dies.
  const trimmed = days.length > 400 ? days.slice(days.length - 400) : days;
  return { ...progress, xp: progress.xp + Math.max(0, xp), days: trimmed };
}

/** Counts one reviewed card against today's goal, resetting on a new day. */
export function countReview(progress: Progress, now: Date): Progress {
  const today = dayKey(now);
  const reviewed = progress.today?.day === today ? progress.today.reviewed + 1 : 1;
  return { ...progress, today: { day: today, reviewed } };
}

/** Cards reviewed today — 0 only because a day that has started really has
 *  zero reviews so far, which is a measurement and not a placeholder. */
export function reviewedToday(progress: Progress, now: Date): number {
  return progress.today?.day === dayKey(now) ? progress.today.reviewed : 0;
}

// ── Badges ──────────────────────────────────────────────────────────────────

export interface BadgeDef {
  id: string;
  icon: string;
  /** Evaluated against real data — never against a stored counter. */
  earned: (s: MeleteState, now: Date) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-course', icon: '📚', earned: (s) => s.courses.length >= 1 },
  { id: 'five-courses', icon: '🗂️', earned: (s) => s.courses.length >= 5 },
  { id: 'first-map', icon: '🧠', earned: (s) => s.maps.length >= 1 },
  { id: 'first-sketch', icon: '✏️', earned: (s) => s.sketches.length >= 1 },
  { id: 'hundred-reviews', icon: '🃏', earned: (s) => s.cards.reduce((n, c) => n + c.reps, 0) >= 100 },
  { id: 'deep-cut', icon: '💎', earned: (s) => s.cards.some((c) => c.box === MAX_BOX) },
  {
    id: 'perfect-quiz',
    icon: '🎯',
    earned: (s) => s.attempts.some((a) => a.total >= 5 && a.correct === a.total),
  },
  { id: 'week-streak', icon: '🔥', earned: (s, now) => streakFrom(s.progress.days, now) >= 7 },
  {
    id: 'polymath',
    icon: '🦉',
    earned: (s) => new Set(s.courses.map((c) => c.subject.trim().toLowerCase()).filter(Boolean)).size >= 3,
  },
];

/**
 * Badges earned as of now, unioned with the ones already held.
 *
 * The union is the point: a badge is a record of something that HAPPENED. Let
 * a streak badge evaporate when the streak breaks and the wall of badges
 * becomes a wall of accusations.
 */
export function awardBadges(state: MeleteState, now: Date): string[] {
  const held = new Set(state.progress.badges);
  for (const b of BADGES) {
    if (!held.has(b.id) && b.earned(state, now)) held.add(b.id);
  }
  return [...held];
}

/** Badge ids earned in `next` that were not in `prev` — what to celebrate. */
export function newlyEarned(prev: string[], next: string[]): string[] {
  const before = new Set(prev);
  return next.filter((id) => !before.has(id));
}
