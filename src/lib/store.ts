/**
 * store.ts — the whole of Melete's memory of itself, and the budget it lives in.
 *
 * The host gives a cartridge one durable blob, namespaced to it and capped at
 * **256 KB** (doc 73). That cap is not a detail: a student with thirty courses
 * will hit it, and what happens then is a product decision, not an exception.
 *
 * Two rules make it survivable:
 *
 *  1. **Nothing is written before something is read.** A mutation that lands
 *     while the first `state.get` is still in flight would persist an empty
 *     library over a real one. `save()` refuses until `load()` has answered
 *     once — a slow host must never cost a student their decks.
 *  2. **Shedding is declared and reported.** When the blob will not fit,
 *     Melete drops things in a fixed order, cheapest first, and SAYS what it
 *     dropped. Silently losing the newest deck is the failure this exists to
 *     prevent.
 */
import { emptyState, type Doc, type MeleteState } from './types';
import { readState, writeState } from './host';
import { migrateV1 } from './migrate';
import { log } from './log';

/** The host's hard cap (main/state/cartridgeState.ts MAX_BYTES). */
export const STATE_BUDGET = 256 * 1024;

/** Start shedding before the wall: a save that fails outright loses the whole
 *  turn, and the last 8 % is worth spending on room to manoeuvre. */
const SHED_THRESHOLD = Math.floor(STATE_BUDGET * 0.92);

export interface ShedReport {
  /** Courses whose kept source text was released but which can be re-read. */
  releasedRereadable: number;
  /** Courses whose kept source text is GONE — nothing on disk to re-read. */
  releasedLost: number;
  /** Quiz attempts dropped from the history. */
  attemptsDropped: number;
}

export interface SaveOutcome {
  ok: boolean;
  /** Bytes the payload actually weighs — the number the UI shows. */
  bytes: number;
  shed: ShedReport | null;
  error?: string;
}

export function byteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
  // Node < 11 / exotic runtimes: an over-estimate is safe, an under-estimate is not.
  return json.length * 2;
}

/** A document with no file behind it cannot be re-read: its retained text is
 *  the only copy, and releasing it is a real loss rather than a cache miss. */
const hasNoSource = (d: Doc): boolean => d.sourcePath === null;

/** Every document of every course, oldest first — the order eviction walks. */
function allDocs(state: MeleteState): { courseId: string; doc: Doc }[] {
  return state.courses
    .flatMap((c) => c.docs.map((doc) => ({ courseId: c.id, doc })))
    .sort((a, b) => (a.doc.addedAt < b.doc.addedAt ? -1 : 1));
}

/**
 * Brings a state under budget, in a declared order.
 *
 * Order matters and is the product decision: source text a student can get
 * back goes first, then history, then source text they cannot get back. Cards,
 * maps, schemas, quizzes, the PLAN and XP are never shed — those are the work,
 * and the plan in particular is tiny and was validated by hand.
 */
export function fitToBudget(state: MeleteState): { state: MeleteState; shed: ShedReport | null } {
  if (byteLength(state) <= SHED_THRESHOLD) return { state, shed: null };

  const shed: ShedReport = { releasedRereadable: 0, releasedLost: 0, attemptsDropped: 0 };
  const ordered = allDocs(state);
  let next = state;

  const release = (predicate: (d: Doc) => boolean, tally: () => void): void => {
    for (const { courseId, doc } of ordered) {
      if (byteLength(next) <= SHED_THRESHOLD) return;
      if (doc.retained === null || !predicate(doc)) continue;
      next = {
        ...next,
        courses: next.courses.map((c) => (c.id !== courseId ? c : {
          ...c,
          docs: c.docs.map((d) => (d.id === doc.id ? { ...d, retained: null } : d)),
        })),
      };
      tally();
    }
  };

  release((d) => !hasNoSource(d), () => { shed.releasedRereadable += 1; });

  if (byteLength(next) > SHED_THRESHOLD && next.attempts.length > 40) {
    shed.attemptsDropped = next.attempts.length - 40;
    next = { ...next, attempts: next.attempts.slice(next.attempts.length - 40) };
  }

  if (byteLength(next) > SHED_THRESHOLD && next.progress.days.length > 180) {
    next = {
      ...next,
      progress: { ...next.progress, days: next.progress.days.slice(next.progress.days.length - 180) },
    };
  }

  release(hasNoSource, () => { shed.releasedLost += 1; });

  const any = shed.releasedRereadable > 0 || shed.releasedLost > 0 || shed.attemptsDropped > 0;
  return { state: next, shed: any ? shed : null };
}

// ── Hydration ───────────────────────────────────────────────────────────────

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Turns whatever the host handed back into a usable state.
 *
 * Unknown or corrupt input yields an EMPTY state with `fresh: true`, and the
 * caller uses that flag to show onboarding rather than an empty library that
 * looks like data loss.
 */
export function hydrate(raw: unknown): { state: MeleteState; fresh: boolean; migrated: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { state: emptyState(), fresh: true, migrated: false };
  }
  const o = raw as Record<string, unknown>;

  // 🚨 v1 is READ, not discarded. Somebody used v1 with a real course before
  // the binder existed; treating their library as unreadable would lose it.
  if (o.version === 1) {
    const migrated = migrateV1(o);
    if (migrated) {
      log.info('store', 'migrated a v1 library into the binder model', {
        courses: migrated.courses.length, cards: migrated.cards.length,
      });
      return { state: migrated, fresh: false, migrated: true };
    }
  }
  if (o.version !== 2) return { state: emptyState(), fresh: true, migrated: false };

  const base = emptyState();
  const p = (o.progress ?? {}) as Record<string, unknown>;
  return {
    fresh: false,
    migrated: false,
    state: {
      version: 2,
      courses: arr(o.courses),
      maps: arr(o.maps),
      sketches: arr(o.sketches),
      cards: arr(o.cards),
      quizzes: arr(o.quizzes),
      attempts: arr(o.attempts),
      digests: arr(o.digests),
      fiches: arr(o.fiches),
      progress: {
        xp: typeof p.xp === 'number' && Number.isFinite(p.xp) ? p.xp : 0,
        days: arr<string>(p.days).filter((d) => typeof d === 'string'),
        badges: arr<string>(p.badges).filter((b) => typeof b === 'string'),
        dailyGoal: typeof p.dailyGoal === 'number' && p.dailyGoal > 0 ? p.dailyGoal : base.progress.dailyGoal,
        today: p.today && typeof p.today === 'object'
          ? (p.today as MeleteState['progress']['today'])
          : null,
      },
    },
  };
}

// ── The live store ──────────────────────────────────────────────────────────

let current: MeleteState = emptyState();
let loaded = false;
const listeners = new Set<() => void>();

export function getState(): MeleteState {
  return current;
}

export function isLoaded(): boolean {
  return loaded;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

/** Reads the durable blob once. Rejecting here is survivable — the UI shows an
 *  error and REFUSES to save, rather than starting from a blank library. */
export async function load(): Promise<{ fresh: boolean; migrated: boolean }> {
  const raw = await readState<unknown>();
  const { state, fresh, migrated } = hydrate(raw);
  current = state;
  loaded = true;
  log.info('store', fresh ? 'no usable saved state — starting fresh' : 'state read', {
    bytes: byteLength(state), courses: state.courses.length,
    cards: state.cards.length, xp: state.progress.xp,
  });
  emit();
  return { fresh, migrated };
}

/**
 * Applies a change and persists it.
 *
 * The in-memory state is updated immediately (the UI must not wait on a disk
 * write to show a flipped card), and the outcome of the write is returned so a
 * caller can surface a shed or a hard failure.
 */
export async function mutate(fn: (s: MeleteState) => MeleteState): Promise<SaveOutcome> {
  if (!loaded) {
    // See rule 1 at the top of the file. This is not paranoia: it is the exact
    // path by which a slow first read erases a real library.
    log.warn('store', 'a write was refused: the first read has not answered yet');
    return { ok: false, bytes: 0, shed: null, error: 'NOT_LOADED' };
  }
  const proposed = fn(current);
  const { state, shed } = fitToBudget(proposed);
  current = state;
  emit();

  const bytes = byteLength(state);
  if (shed) {
    log.warn('store', 'over budget — released source text to fit', {
      ...shed, bytes, budget: STATE_BUDGET,
    });
  }
  try {
    await writeState(state);
    log.info('store', 'saved', { bytes, pctOfBudget: Math.round((bytes / STATE_BUDGET) * 100) });
    return { ok: true, bytes, shed };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error('store', 'the host refused the write', { bytes, detail });
    return { ok: false, bytes, shed, error: detail };
  }
}

/** Test seam — lets a test start from a known state without a host. */
export function __setStateForTests(state: MeleteState, isLoadedNow = true): void {
  current = state;
  loaded = isLoadedNow;
  emit();
}
