import { describe, expect, it } from 'vitest';
import { awardBadges, countReview, credit, levelFromXp, newlyEarned, reviewedToday, streakFrom, xpForLevel } from './progress';
import { emptyState, type MeleteState } from './types';

const NOW = new Date(2026, 8, 10, 9, 0, 0); // 10 Sept 2026

describe('levelFromXp', () => {
  it('starts everyone at level 1 with an empty bar', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, span: 100 });
  });

  it('climbs on the published thresholds', () => {
    expect(levelFromXp(xpForLevel(2)).level).toBe(2);
    expect(levelFromXp(xpForLevel(2) - 1).level).toBe(1);
    expect(levelFromXp(xpForLevel(5)).level).toBe(5);
  });

  it('never divides by a zero span', () => {
    const view = levelFromXp(12_345);
    expect(view.span).toBeGreaterThan(0);
    expect(view.into).toBeLessThan(view.span);
  });

  it('survives a corrupted total instead of spinning', () => {
    expect(levelFromXp(Number.NaN).level).toBe(1);
    expect(levelFromXp(-500).level).toBe(1);
    expect(levelFromXp(Number.POSITIVE_INFINITY).level).toBe(1);
  });
});

describe('streakFrom', () => {
  it('is zero with no days', () => {
    expect(streakFrom([], NOW)).toBe(0);
  });

  it('counts back from today', () => {
    expect(streakFrom(['2026-09-08', '2026-09-09', '2026-09-10'], NOW)).toBe(3);
  });

  it('still counts when the last day was yesterday — nothing is broken yet', () => {
    expect(streakFrom(['2026-09-08', '2026-09-09'], NOW)).toBe(2);
  });

  it('is zero after a two-day gap', () => {
    expect(streakFrom(['2026-09-06', '2026-09-07', '2026-09-08'], NOW)).toBe(0);
  });

  it('stops at the hole rather than counting every day in the list', () => {
    expect(streakFrom(['2026-09-01', '2026-09-02', '2026-09-09', '2026-09-10'], NOW)).toBe(2);
  });

  it('does not depend on the order the days were written', () => {
    expect(streakFrom(['2026-09-10', '2026-09-08', '2026-09-09'], NOW)).toBe(3);
  });
});

describe('credit', () => {
  it('marks today once, however many times it is called', () => {
    const a = credit(emptyState().progress, 10, NOW);
    const b = credit(a, 10, NOW);
    expect(b.days).toEqual(['2026-09-10']);
    expect(b.xp).toBe(20);
  });

  it('refuses to subtract experience', () => {
    expect(credit(emptyState().progress, -50, NOW).xp).toBe(0);
  });
});

describe('reviewedToday', () => {
  it('reads zero on a new day rather than carrying yesterday over', () => {
    const progress = { ...emptyState().progress, today: { day: '2026-09-09', reviewed: 42 } };
    expect(reviewedToday(progress, NOW)).toBe(0);
    expect(countReview(progress, NOW).today).toEqual({ day: '2026-09-10', reviewed: 1 });
  });
});

describe('awardBadges', () => {
  const withCourses = (n: number): MeleteState => ({
    ...emptyState(),
    courses: Array.from({ length: n }, (_, i) => ({
      id: `c${i}`, title: `t${i}`, subject: `s${i}`, sourceKind: 'paste' as const, sourcePath: null,
      chars: 10, ocr: false, truncated: false, chunks: null, ingestedAt: null,
      createdAt: NOW.toISOString(), retained: 'x',
    })),
  });

  it('gives the first-course badge on the first course', () => {
    expect(awardBadges(withCourses(1), NOW)).toContain('first-course');
    expect(awardBadges(withCourses(0), NOW)).toEqual([]);
  });

  it('keeps a badge whose condition has since stopped holding', () => {
    const state = { ...emptyState(), progress: { ...emptyState().progress, badges: ['week-streak'] } };
    // The streak is long broken: the badge is a record of something that
    // happened, so it stays.
    expect(awardBadges(state, NOW)).toContain('week-streak');
  });

  it('never hands the same badge twice', () => {
    const first = awardBadges(withCourses(5), NOW);
    const again = awardBadges({ ...withCourses(5), progress: { ...emptyState().progress, badges: first } }, NOW);
    expect(again.length).toBe(new Set(again).size);
  });
});

describe('newlyEarned', () => {
  it('names only what was not held before', () => {
    expect(newlyEarned(['a'], ['a', 'b'])).toEqual(['b']);
    expect(newlyEarned(['a', 'b'], ['a', 'b'])).toEqual([]);
  });
});
