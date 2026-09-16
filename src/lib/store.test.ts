import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, type Course, type Doc, type MeleteState } from './types';

const readState = vi.fn();
const writeState = vi.fn();

vi.mock('./host', () => ({
  readState: (...a: unknown[]) => readState(...a),
  writeState: (...a: unknown[]) => writeState(...a),
}));

type Store = typeof import('./store');
let store: Store;

beforeEach(async () => {
  vi.resetModules();
  readState.mockReset();
  writeState.mockReset();
  writeState.mockResolvedValue({ ok: true });
  store = await import('./store');
});

function doc(id: string, over: Partial<Doc> = {}): Doc {
  return {
    id: `doc_${id}`,
    name: `doc ${id}`,
    sourceKind: 'file',
    sourcePath: `/c/${id}.pdf`,
    chars: 30_000,
    ocr: false,
    truncated: false,
    chunks: 12,
    ingestedAt: null,
    addedAt: `2026-01-${id.padStart(2, '0')}`,
    retained: 'x'.repeat(30_000),
    ...over,
  };
}

function course(id: string, docs: Doc[]): Course {
  return {
    id: `course_${id}`,
    title: `course ${id}`,
    subject: 'law',
    teacher: '',
    level: '',
    docs,
    plan: null,
    intent: null,
    createdAt: `2026-01-${id.padStart(2, '0')}`,
  };
}

const withCourses = (courses: Course[]): MeleteState => ({ ...emptyState(), courses });

describe('hydrate', () => {
  it('treats junk as a fresh install rather than as data loss', () => {
    expect(store.hydrate(null).fresh).toBe(true);
    expect(store.hydrate('a string').fresh).toBe(true);
    expect(store.hydrate([]).fresh).toBe(true);
    expect(store.hydrate({ version: 99 }).fresh).toBe(true);
  });

  it('READS a v1 blob instead of discarding somebody real library', () => {
    const v1 = {
      version: 1,
      courses: [{ id: 'c1', title: 'Vieux cours', chars: 100, retained: 'texte' }],
      cards: [{ id: 'k1', courseId: 'c1', front: 'f', back: 'b', box: 1, dueAt: '2026-01-01', reps: 0, lapses: 0, lastSeenAt: null }],
      progress: { xp: 120 },
    };
    const out = store.hydrate(v1);
    expect(out.fresh).toBe(false);
    expect(out.migrated).toBe(true);
    expect(out.state.version).toBe(2);
    expect(out.state.courses[0]?.docs).toHaveLength(1);
    expect(out.state.cards).toHaveLength(1);
    expect(out.state.progress.xp).toBe(120);
  });

  it('restores a v2 blob without inventing anything', () => {
    const saved: MeleteState = {
      ...withCourses([course('1', [doc('1')])]),
      progress: { xp: 40, days: ['2026-01-01'], badges: ['first-course'], dailyGoal: 30, today: null },
    };
    const { state, fresh, migrated } = store.hydrate(JSON.parse(JSON.stringify(saved)));
    expect(fresh).toBe(false);
    expect(migrated).toBe(false);
    expect(state.courses[0]?.docs).toHaveLength(1);
    expect(state.progress.xp).toBe(40);
    expect(state.progress.dailyGoal).toBe(30);
  });

  it('refuses a corrupted xp instead of rendering NaN everywhere', () => {
    const { state } = store.hydrate({ version: 2, progress: { xp: 'lots' } });
    expect(state.progress.xp).toBe(0);
  });
});

describe('fitToBudget', () => {
  it('leaves a small state exactly as it was', () => {
    const s = withCourses([course('1', [doc('1', { retained: 'short' })])]);
    const out = store.fitToBudget(s);
    expect(out.shed).toBeNull();
    expect(out.state).toBe(s);
  });

  it('releases re-readable source text BEFORE text that cannot come back', () => {
    const pasted = doc('01', { sourceKind: 'paste', sourcePath: null });
    const fromFile = Array.from({ length: 8 }, (_, i) => doc(`${i + 2}`.padStart(2, '0')));
    const out = store.fitToBudget(withCourses([course('1', [pasted, ...fromFile])]));
    expect(out.shed).not.toBeNull();
    expect(out.shed?.releasedRereadable).toBeGreaterThan(0);
    // The pasted document is the oldest, so an "oldest first" rule with no
    // re-readability test would have taken it first.
    const kept = out.state.courses[0]?.docs.find((d) => d.id === 'doc_01');
    expect(kept?.retained).not.toBeNull();
  });

  it('sheds ACROSS binders, not just inside the biggest one', () => {
    const out = store.fitToBudget(withCourses([
      course('1', [doc('01'), doc('02')]),
      course('2', [doc('03'), doc('04'), doc('05'), doc('06'), doc('07'), doc('08'), doc('09')]),
    ]));
    const released = out.state.courses.flatMap((c) => c.docs).filter((d) => d.retained === null);
    expect(released.length).toBeGreaterThan(0);
  });

  it('never sheds the work — cards, maps and the PLAN survive', () => {
    const withPlan: Course = {
      ...course('1', Array.from({ length: 9 }, (_, i) => doc(`${i + 1}`.padStart(2, '0')))),
      plan: {
        proposedAt: 'x',
        validatedAt: '2026-01-02',
        sections: [{ id: 's1', title: 'Partie 1', docId: 'doc_01', anchor: 'a', start: 0, end: 10 }],
      },
    };
    const s: MeleteState = {
      ...withCourses([withPlan]),
      cards: [{ id: 'c1', courseId: 'course_1', front: 'f', back: 'b', box: 1, dueAt: '2026-01-01', reps: 0, lapses: 0, lastSeenAt: null }],
      maps: [{ id: 'm1', courseId: 'course_1', createdAt: '', scope: { k: 'course' }, title: 'm', root: { id: 'r', label: 'r' } }],
    };
    const out = store.fitToBudget(s);
    expect(out.state.cards).toHaveLength(1);
    expect(out.state.maps).toHaveLength(1);
    // A plan is tiny and was validated by hand: shedding it would throw away
    // the one thing the human actually decided.
    expect(out.state.courses[0]?.plan?.sections).toHaveLength(1);
    expect(out.state.courses[0]?.plan?.validatedAt).toBe('2026-01-02');
  });

  it('brings the blob under the host cap', () => {
    const out = store.fitToBudget(withCourses([
      course('1', Array.from({ length: 12 }, (_, i) => doc(`${i + 1}`.padStart(2, '0')))),
    ]));
    expect(store.byteLength(out.state)).toBeLessThanOrEqual(store.STATE_BUDGET);
  });
});

describe('mutate', () => {
  it('REFUSES to write before the first read has answered', async () => {
    const res = await store.mutate((s) => ({ ...s, courses: [course('1', [])] }));
    expect(res).toMatchObject({ ok: false, error: 'NOT_LOADED' });
    expect(writeState).not.toHaveBeenCalled();
  });

  it('writes once the state has been read', async () => {
    readState.mockResolvedValue({ ...emptyState() });
    await store.load();
    const res = await store.mutate((s) => ({ ...s, progress: { ...s.progress, xp: 10 } }));
    expect(res.ok).toBe(true);
    expect(writeState).toHaveBeenCalledTimes(1);
    expect(store.getState().progress.xp).toBe(10);
  });

  it('reports a failed write instead of pretending it landed', async () => {
    readState.mockResolvedValue({ ...emptyState() });
    await store.load();
    writeState.mockRejectedValue(new Error('TOO_LARGE'));
    const res = await store.mutate((s) => ({ ...s, progress: { ...s.progress, xp: 1 } }));
    expect(res.ok).toBe(false);
    expect(res.error).toContain('TOO_LARGE');
  });

  it('tells subscribers before the write has finished', async () => {
    readState.mockResolvedValue({ ...emptyState() });
    await store.load();
    const seen: number[] = [];
    const off = store.subscribe(() => seen.push(store.getState().progress.xp));
    await store.mutate((s) => ({ ...s, progress: { ...s.progress, xp: 7 } }));
    off();
    expect(seen).toContain(7);
  });

  it('reports a v1 library as migrated so the UI can say so once', async () => {
    readState.mockResolvedValue({ version: 1, courses: [{ id: 'c1', title: 'Vieux' }] });
    const res = await store.load();
    expect(res.migrated).toBe(true);
    expect(store.getState().courses[0]?.docs).toHaveLength(1);
  });
});
