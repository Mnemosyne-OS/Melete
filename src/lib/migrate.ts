/**
 * migrate.ts — carrying a v1 library into the v2 binder model.
 *
 * v1 made `Course` and "one imported file" the same object. v2 makes a course
 * a binder of documents. Somebody has already used v1 with a real course, so
 * this is not a formality: **a migration that drops a deck is worse than the
 * refactor was worth.**
 *
 * Two rules it obeys:
 *
 *  - **Nothing is invented.** A v1 course had no teacher, no level, no plan and
 *    no stated intent, so the binder gets empty strings and nulls — never a
 *    plausible guess, and never a plan Melete would then treat as validated.
 *  - **Ids survive.** Every card, map, quiz and attempt is keyed on `courseId`,
 *    so the binder keeps the course's original id and every artifact still
 *    finds its course without being rewritten.
 */
import { newId } from './id';
import { emptyState, type Course, type Doc, type MeleteState, type Scope } from './types';

const COURSE_SCOPE: Scope = { k: 'course' };

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown): boolean => v === true;
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** A v1 course becomes a binder holding exactly the document it always was. */
function courseFromV1(raw: Record<string, unknown>): Course {
  const createdAt = str(raw.createdAt, new Date().toISOString());
  const title = str(raw.title, 'Sans titre');
  const doc: Doc = {
    id: newId('doc'),
    name: title,
    sourceKind: raw.sourceKind === 'photo' || raw.sourceKind === 'paste' ? raw.sourceKind : 'file',
    sourcePath: nullableStr(raw.sourcePath),
    chars: num(raw.chars),
    ocr: bool(raw.ocr),
    truncated: bool(raw.truncated),
    chunks: nullableNum(raw.chunks),
    ingestedAt: nullableStr(raw.ingestedAt),
    addedAt: createdAt,
    retained: nullableStr(raw.retained),
  };
  return {
    id: str(raw.id, newId('course')),
    title,
    subject: str(raw.subject),
    // Not known in v1. An empty string is the honest carry-over; inventing
    // "Unknown" would put a word on screen that nobody typed.
    teacher: '',
    level: '',
    docs: [doc],
    plan: null,
    intent: null,
    createdAt,
  };
}

/** Adds the provenance v2 artifacts carry, without claiming what v1 never knew. */
function withScope<T extends Record<string, unknown>>(raw: T): T & { scope: Scope } {
  // `complete` is deliberately NOT set: v1 did not record it, and the UI reads
  // its absence as "nobody measured" rather than as either verdict.
  return { ...raw, scope: COURSE_SCOPE };
}

const arr = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

/**
 * Migrates a v1 blob. Returns null when `raw` is not a v1 state, so the caller
 * can tell "an old library I carried over" from "something I could not read".
 */
export function migrateV1(raw: unknown): MeleteState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;

  const base = emptyState();
  const p = (o.progress ?? {}) as Record<string, unknown>;

  return {
    version: 2,
    courses: arr(o.courses).map(courseFromV1),
    maps: arr(o.maps).map(withScope) as unknown as MeleteState['maps'],
    sketches: arr(o.sketches).map(withScope) as unknown as MeleteState['sketches'],
    // Cards carry no provenance of their own beyond courseId — they are
    // unchanged by the model shift and are copied as they are.
    cards: arr(o.cards) as unknown as MeleteState['cards'],
    quizzes: arr(o.quizzes).map(withScope) as unknown as MeleteState['quizzes'],
    attempts: arr(o.attempts) as unknown as MeleteState['attempts'],
    digests: arr(o.digests).map(withScope) as unknown as MeleteState['digests'],
    // v1 had no fiche at all — an empty list, never an invented one.
    fiches: [],
    progress: {
      xp: num(p.xp),
      days: (Array.isArray(p.days) ? p.days : []).filter((d): d is string => typeof d === 'string'),
      badges: (Array.isArray(p.badges) ? p.badges : []).filter((b): b is string => typeof b === 'string'),
      dailyGoal: typeof p.dailyGoal === 'number' && p.dailyGoal > 0 ? p.dailyGoal : base.progress.dailyGoal,
      today: p.today && typeof p.today === 'object' ? (p.today as MeleteState['progress']['today']) : null,
    },
  };
}
