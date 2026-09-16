/**
 * id.ts — one collision-resistant id source.
 *
 * `Date.now()` alone collides: a generation writes forty cards inside the same
 * millisecond, React keys them by id, and two cards share a key — which shows
 * up as a card that will not flip, not as an error.
 */
let counter = 0;

export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
