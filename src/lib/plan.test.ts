import { describe, expect, it } from 'vitest';
import { anchorSections, asProposedPlan, courseText, findAnchor, locatedCount, textForScope } from './plan';
import type { Course, Doc, Section } from './types';

const NOW = new Date(2026, 8, 1);

const DOC_TEXT = [
  'Chapitre 1 — Les sources formelles',
  'La loi au sens large comprend la Constitution et les ordonnances.',
  '',
  'Chapitre 2 — La jurisprudence',
  "Elle n'est pas une source formelle au sens strict.",
].join('\n');

function doc(over: Partial<Doc> = {}): Doc {
  return {
    id: 'd1', name: 'Cours 3', sourceKind: 'file', sourcePath: '/c/cours.pdf',
    chars: DOC_TEXT.length, ocr: false, truncated: false, chunks: 4,
    ingestedAt: null, addedAt: NOW.toISOString(), retained: DOC_TEXT, ...over,
  };
}

function course(docs: Doc[], sections: Section[] = []): Course {
  return {
    id: 'k1', title: 'Droit civil 3', subject: 'Droit', teacher: '', level: '',
    docs,
    plan: sections.length ? { proposedAt: '', validatedAt: null, sections } : null,
    intent: null, createdAt: NOW.toISOString(),
  };
}

describe('findAnchor', () => {
  it('finds a heading copied exactly', () => {
    expect(findAnchor(DOC_TEXT, 'Chapitre 2 — La jurisprudence')).toBe(DOC_TEXT.indexOf('Chapitre 2'));
  });

  it('survives the case and spacing a model changes when it re-types', () => {
    expect(findAnchor(DOC_TEXT, 'chapitre 2   —   la JURISPRUDENCE')).toBe(DOC_TEXT.indexOf('Chapitre 2'));
  });

  it('finds an anchor that spans a line break', () => {
    // The model quotes running text; the document wraps it. Normalising both
    // sides is what makes that the same string.
    expect(findAnchor(DOC_TEXT, 'formelles La loi au sens large')).toBeGreaterThan(0);
  });

  it('returns null for a paraphrase rather than a plausible position', () => {
    expect(findAnchor(DOC_TEXT, 'Deuxième chapitre sur les décisions de justice')).toBeNull();
  });

  it('refuses an anchor too short to identify anything', () => {
    expect(findAnchor(DOC_TEXT, 'La')).toBeNull();
    expect(findAnchor(DOC_TEXT, '')).toBeNull();
  });
});

describe('anchorSections', () => {
  const sections: Section[] = [
    { id: 's1', title: 'Sources formelles', docId: 'd1', anchor: 'Chapitre 1 — Les sources formelles', start: null, end: null },
    { id: 's2', title: 'Jurisprudence', docId: 'd1', anchor: 'Chapitre 2 — La jurisprudence', start: null, end: null },
  ];

  it('closes each range at the start of the next section', () => {
    const out = anchorSections(sections, [doc()]);
    expect(out[0]?.start).toBe(0);
    expect(out[0]?.end).toBe(out[1]?.start);
    expect(out[1]?.end).toBe(DOC_TEXT.length);
  });

  it('marks a section it could not locate instead of guessing a range', () => {
    const out = anchorSections([
      ...sections,
      { id: 's3', title: 'Doctrine', docId: 'd1', anchor: 'Chapitre 3 — La doctrine', start: null, end: null },
    ], [doc()]);
    const lost = out.find((s) => s.id === 's3');
    expect(lost?.start).toBeNull();
    expect(lost?.end).toBeNull();
  });

  it('does not let an unlocatable section truncate the one before it', () => {
    const out = anchorSections([
      { id: 's1', title: 'A', docId: 'd1', anchor: 'Chapitre 1 — Les sources formelles', start: null, end: null },
      { id: 'ghost', title: 'B', docId: 'd1', anchor: 'nothing like this in the text', start: null, end: null },
    ], [doc()]);
    expect(out[0]?.end).toBe(DOC_TEXT.length);
  });

  it('leaves everything unlocated when the document text was released', () => {
    const out = anchorSections(sections, [doc({ retained: null })]);
    expect(out.every((s) => s.start === null)).toBe(true);
  });
});

describe('textForScope', () => {
  const located = anchorSections([
    { id: 's1', title: 'Sources formelles', docId: 'd1', anchor: 'Chapitre 1 — Les sources formelles', start: null, end: null },
    { id: 's2', title: 'Jurisprudence', docId: 'd1', anchor: 'Chapitre 2 — La jurisprudence', start: null, end: null },
  ], [doc()]);

  it('hands over just the section that was asked for', () => {
    const c = course([doc()], located);
    const out = textForScope(c, { k: 'section', sectionId: 's2' });
    expect(out.located).toBe(true);
    expect(out.text).toContain('jurisprudence');
    expect(out.text).not.toContain('Chapitre 1');
  });

  it('widens to the whole document when the anchor was never found, and SAYS so', () => {
    const ghost: Section = { id: 'g', title: 'Doctrine', docId: 'd1', anchor: 'absent', start: null, end: null };
    const c = course([doc()], [ghost]);
    const out = textForScope(c, { k: 'section', sectionId: 'g' });
    expect(out.text).toBe(DOC_TEXT);
    // The whole point: silently widening is how a student gets a fiche on the
    // wrong chapter and never learns why.
    expect(out.located).toBe(false);
  });

  it('joins every document for a whole-course scope, each under its name', () => {
    const c = course([doc(), doc({ id: 'd2', name: 'TD 4', retained: 'Le cas pratique.' })]);
    const out = textForScope(c, { k: 'course' });
    expect(out.text).toContain('## Cours 3');
    expect(out.text).toContain('## TD 4');
    expect(out.located).toBe(true);
  });

  it('skips a document whose text was released rather than emitting an empty heading', () => {
    const c = course([doc(), doc({ id: 'd2', name: 'TD 4', retained: null })]);
    expect(courseText(c)).not.toContain('TD 4');
  });
});

describe('courseText — the provenance rule', () => {
  const own = doc();
  const web = doc({ id: 'w1', name: 'Wikipedia', sourceKind: 'web', sourcePath: 'https://fr.wikipedia.org/x', retained: 'Contenu venu du web.' });

  it('includes web material by default — a fiche may be fed by it', () => {
    const text = courseText(course([own, web]));
    expect(text).toContain('Contenu venu du web.');
  });

  it('EXCLUDES it when asked, which is what the quiz does', () => {
    // The rule with teeth (lib/web.ts): a student who writes back a source
    // their professor never gave is penalised, and it would be Melete that led
    // them there.
    const text = courseText(course([own, web]), { excludeWeb: true });
    expect(text).not.toContain('Contenu venu du web.');
    expect(text).toContain('Chapitre 1');
  });

  it('excludes a SECTION that lives in a web document too', () => {
    const sec = { id: 'sw', title: 'Partie web', docId: 'w1', anchor: 'Contenu venu', start: 0, end: 10 };
    const c = course([own, web], [sec]);
    expect(textForScope(c, { k: 'section', sectionId: 'sw' }).text).not.toBe('');
    expect(textForScope(c, { k: 'section', sectionId: 'sw' }, { excludeWeb: true }).text).toBe('');
  });
});

describe('asProposedPlan', () => {
  const reply = {
    title: 'Droit civil — cours 3',
    subject: 'Droit',
    teacher: '',
    level: 'L1',
    sections: [
      { title: 'Sources formelles', document: 'Cours 3', anchor: 'Chapitre 1 — Les sources formelles' },
      { title: 'Jurisprudence', document: 'Cours 3', anchor: 'Chapitre 2 — La jurisprudence' },
    ],
  };

  it('locates the sections it reads', () => {
    const out = asProposedPlan(reply, [doc()], NOW);
    expect(out?.title).toBe('Droit civil — cours 3');
    expect(out?.plan.sections).toHaveLength(2);
    expect(locatedCount(out!.plan)).toBe(2);
  });

  it('NEVER returns a validated plan — only a human press can do that', () => {
    expect(asProposedPlan(reply, [doc()], NOW)?.plan.validatedAt).toBeNull();
  });

  it('resolves the document by NAME, since a model-invented id points nowhere', () => {
    const docs = [doc(), doc({ id: 'd2', name: 'TD 4', retained: 'Le cas pratique de la semaine.' })];
    const out = asProposedPlan({
      sections: [{ title: 'Le TD', document: 'TD 4', anchor: 'Le cas pratique de la semaine.' }],
    }, docs, NOW);
    expect(out?.plan.sections[0]?.docId).toBe('d2');
  });

  it('drops a section with no title or no anchor', () => {
    const out = asProposedPlan({
      sections: [
        { title: 'Bonne', document: 'Cours 3', anchor: 'Chapitre 1 — Les sources formelles' },
        { title: 'Sans ancre', document: 'Cours 3' },
        { document: 'Cours 3', anchor: 'Chapitre 2' },
      ],
    }, [doc()], NOW);
    expect(out?.plan.sections).toHaveLength(1);
  });

  it('returns null when nothing usable came back', () => {
    expect(asProposedPlan({ sections: [] }, [doc()], NOW)).toBeNull();
    expect(asProposedPlan('nope', [doc()], NOW)).toBeNull();
    expect(asProposedPlan(null, [doc()], NOW)).toBeNull();
  });

  it('keeps an empty teacher empty rather than inventing one', () => {
    const out = asProposedPlan(reply, [doc()], NOW);
    expect(out?.teacher).toBe('');
  });
});
