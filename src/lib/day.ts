/**
 * day.ts — the calendar arithmetic every other module shares.
 *
 * A student's day is their LOCAL day. Storing UTC day keys would roll a streak
 * over at 01:00 for anyone east of Greenwich and at 20:00 for anyone west of
 * it, which is exactly the kind of silent unfairness a streak must not have.
 */

/** Local 'YYYY-MM-DD' for a Date. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a 'YYYY-MM-DD' back into a local Date at midnight. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => Number(n));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Day key `n` days after `key` (n may be negative). */
export function addDays(key: string, n: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from `a` to `b`, positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  const ms = fromDayKey(b).getTime() - fromDayKey(a).getTime();
  return Math.round(ms / 86_400_000);
}
