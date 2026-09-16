/**
 * weak.ts — what resists, measured rather than declared.
 *
 * "Apprendre plus en profondeur" was the vaguest item on the field report, and
 * this is the part of it that can be made true instead of promised: Melete
 * already knows which topics a student misses, because every quiz attempt
 * records them. Until now that knowledge was DISPLAYED and nothing more — a
 * dead promise in the exact sense the review checklist names.
 *
 * 🚨 What a student SAYS resists them and what they actually MISS are two
 * different facts, and this module keeps them apart. The stated weakness lives
 * in `Intent.weak` and is theirs; the measured one is computed here from
 * attempts. The prompt carries both, labelled, because merging them would let
 * the app tell somebody they are bad at something they never said and never
 * failed — or bury a real, repeated miss under an old self-assessment.
 *
 * 🎭 And a topic missed ONCE is not a weakness. One bad answer is a bad day.
 * `MIN_MISSES` is the line between an incident and a pattern, and it is stated
 * rather than hidden so the number can be argued with.
 */
import type { QuizAttempt } from './types';

/** Below this, a miss is an incident. At or above it, it is a pattern. */
export const MIN_MISSES = 2;

export interface WeakTopic {
  topic: string;
  /** How many attempts missed it. A MEASURE, never an estimate. */
  misses: number;
  /** How many attempts could have missed it — the denominator that makes the
   *  numerator mean something. */
  attempts: number;
}

/**
 * Topics this course keeps costing the student, worst first.
 *
 * Ties break on the topic name so the list is stable between renders: a row
 * that reorders every time the screen repaints reads as noise, and the student
 * stops trusting it.
 */
export function weakTopics(attempts: QuizAttempt[], courseId: string): WeakTopic[] {
  const mine = attempts.filter((a) => a.courseId === courseId);
  if (mine.length === 0) return [];

  const counts = new Map<string, number>();
  for (const attempt of mine) {
    // One attempt counts ONCE per topic even if it missed three questions on
    // it: otherwise a long quiz on one subject outranks a topic failed across
    // four separate sittings, which is the one that actually resists.
    for (const topic of new Set(attempt.missed.filter(Boolean))) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_MISSES)
    .map(([topic, misses]) => ({ topic, misses, attempts: mine.length }))
    .sort((a, b) => (b.misses - a.misses) || a.topic.localeCompare(b.topic));
}

/**
 * The line the prompt carries about measured weakness, or null when there is
 * nothing measured to say.
 *
 * ⛔ Returns null rather than an empty sentence: a prompt that says "the
 * student struggles with: " and stops is worse than one that says nothing,
 * because the model will fill the blank.
 */
export function measuredWeakness(topics: WeakTopic[]): string | null {
  if (topics.length === 0) return null;
  const named = topics.slice(0, 4).map((w) => `${w.topic} (${w.misses}/${w.attempts})`);
  return named.join(', ');
}
