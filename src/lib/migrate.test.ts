import { describe, expect, it } from 'vitest';
import { migrateV1 } from './migrate';

/** A v1 blob as the cartridge actually wrote them, with one real course and
 *  the artifacts that hang off it. */
const V1 = {
  version: 1,
  courses: [{
    id: 'course_abc', title: 'Droit civil — cours 3', subject: 'Droit',
    sourceKind: 'file', sourcePath: 'C:/cours/droit.pdf', chars: 41320,
    ocr: false, truncated: true, chunks: 29, ingestedAt: '2026-09-01T10:00:00.000Z',
    createdAt: '2026-09-01T09:00:00.000Z', retained: 'Les sources du droit…',
  }],
  maps: [{ id: 'm1', courseId: 'course_abc', title: 'Sources', createdAt: 'x', root: { id: 'r', label: 'Sources' } }],
  sketches: [],
  cards: [{ id: 'c1', courseId: 'course_abc', front: 'q', back: 'a', box: 3, dueAt: '2026-09-04', reps: 5, lapses: 1, lastSeenAt: null }],
  quizzes: [{ id: 'q1', courseId: 'course_abc', title: 'T', createdAt: 'x', questions: [] }],
  attempts: [{ quizId: 'q1', courseId: 'course_abc', at: 'x', correct: 2, total: 3, missed: ['hiérarchie'] }],
  digests: [{ id: 'g1', courseId: 'course_abc', createdAt: 'x', keyPoints: ['p'], glossary: [] }],
  progress: { xp: 340, days: ['2026-08-31', '2026-09-01'], badges: ['first-course'], dailyGoal: 30, today: { day: '2026-09-01', reviewed: 6 } },
};

describe('migrateV1', () => {
  it('refuses anything that is not a v1 blob', () => {
    expect(migrateV1(null)).toBeNull();
    expect(migrateV1({ version: 2 })).toBeNull();
    expect(migrateV1('a string')).toBeNull();
    expect(migrateV1([])).toBeNull();
  });

  it('turns the course into a binder holding the document it always was', () => {
    const out = migrateV1(V1)!;
    expect(out.version).toBe(2);
    expect(out.courses).toHaveLength(1);
    const course = out.courses[0]!;
    expect(course.docs).toHaveLength(1);
    const doc = course.docs[0]!;
    expect(doc.name).toBe('Droit civil — cours 3');
    expect(doc.chars).toBe(41320);
    expect(doc.chunks).toBe(29);
    expect(doc.truncated).toBe(true);
    expect(doc.sourcePath).toBe('C:/cours/droit.pdf');
    expect(doc.retained).toBe('Les sources du droit…');
  });

  it('KEEPS the course id, so every artifact still finds its course', () => {
    const out = migrateV1(V1)!;
    expect(out.courses[0]?.id).toBe('course_abc');
    expect(out.cards[0]?.courseId).toBe('course_abc');
    expect(out.maps[0]?.courseId).toBe('course_abc');
    expect(out.quizzes[0]?.courseId).toBe('course_abc');
    expect(out.digests[0]?.courseId).toBe('course_abc');
    expect(out.attempts[0]?.courseId).toBe('course_abc');
  });

  it('loses nothing — every deck, map, quiz and attempt survives', () => {
    const out = migrateV1(V1)!;
    expect(out.cards).toHaveLength(1);
    expect(out.maps).toHaveLength(1);
    expect(out.quizzes).toHaveLength(1);
    expect(out.attempts).toHaveLength(1);
    expect(out.digests).toHaveLength(1);
    expect(out.progress.xp).toBe(340);
    expect(out.progress.badges).toEqual(['first-course']);
    expect(out.progress.dailyGoal).toBe(30);
  });

  it('does not invent a teacher, a level, a plan or an intent', () => {
    const course = migrateV1(V1)!.courses[0]!;
    expect(course.teacher).toBe('');
    expect(course.level).toBe('');
    // A migrated course must never arrive with a plan Melete would then treat
    // as agreed by somebody who never saw it.
    expect(course.plan).toBeNull();
    expect(course.intent).toBeNull();
  });

  it('gives every artifact a whole-course scope and NO completeness verdict', () => {
    const out = migrateV1(V1)!;
    expect(out.maps[0]?.scope).toEqual({ k: 'course' });
    // 🎭 v1 never recorded it. Absent means nobody measured, which is neither
    // "partial" (an accusation) nor "complete" (a promise).
    expect(out.maps[0]?.complete).toBeUndefined();
    expect(out.quizzes[0]?.complete).toBeUndefined();
  });

  it('survives a v1 blob with fields missing rather than throwing', () => {
    const out = migrateV1({ version: 1, courses: [{ title: 'Nu' }] })!;
    expect(out.courses[0]?.docs[0]?.chars).toBe(0);
    expect(out.courses[0]?.docs[0]?.chunks).toBeNull();
    expect(out.courses[0]?.docs[0]?.sourcePath).toBeNull();
    expect(out.progress.xp).toBe(0);
  });

  it('drops junk entries instead of letting them through as courses', () => {
    const out = migrateV1({ version: 1, courses: ['nope', null, { title: 'Vrai' }] })!;
    expect(out.courses).toHaveLength(1);
    expect(out.courses[0]?.title).toBe('Vrai');
  });
});
