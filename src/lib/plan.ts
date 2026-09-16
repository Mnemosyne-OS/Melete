/**
 * plan.ts — the structure of a course, and what "generate on this part" means.
 *
 * The plan is what turns Melete from "read the first 12 000 characters and hope"
 * into "read THIS part, because the human said that is the part". It is also
 * the only screen where somebody can fix what the OCR misread in a heading.
 *
 * 🚨 Sections are located by ANCHOR TEXT, never by an index the model gave us.
 * Ask a model for character offsets and it returns numbers that look plausible
 * and point nowhere — silently, since any number slices some text. Ask it to
 * quote the opening words instead and we get something we can SEARCH for, whose
 * failure to match is detectable and sayable. `start: null` is that failure,
 * and it is a state the UI shows rather than a fallback nobody sees.
 */
import { newId } from './id';
import { log } from './log';
import type { Course, Doc, Plan, Scope, Section } from './types';

/** Normalised text plus a map back to the original offsets.
 *  Lowercase and single-spaced, because a model re-typing a heading changes
 *  the case and the spacing far more often than it changes the words. */
function normalise(text: string): { norm: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      chars.push(' ');
      map.push(i);
      lastWasSpace = true;
    } else {
      chars.push(ch.toLowerCase());
      map.push(i);
      lastWasSpace = false;
    }
  }
  return { norm: chars.join(''), map };
}

/** Original-text offset where `anchor` starts, or null when it is not there. */
export function findAnchor(text: string, anchor: string): number | null {
  const needle = anchor.trim().toLowerCase().replace(/\s+/g, ' ');
  if (needle.length < 4) return null; // too short to identify anything
  const { norm, map } = normalise(text);
  const at = norm.indexOf(needle);
  if (at === -1) return null;
  return map[at] ?? null;
}

/**
 * Locates every section in its document and closes each range at the start of
 * the next one.
 *
 * A section whose anchor was not found keeps `start: null` and takes no space
 * from its neighbours — a section that could not be located must not silently
 * truncate the one before it.
 */
export function anchorSections(sections: Section[], docs: Doc[]): Section[] {
  const located = sections.map((s) => {
    const doc = docs.find((d) => d.id === s.docId);
    const text = doc?.retained ?? null;
    const start = text ? findAnchor(text, s.anchor) : null;
    return { ...s, start, end: null as number | null };
  });

  for (const doc of docs) {
    const mine = located
      .filter((s) => s.docId === doc.id && s.start !== null)
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (let i = 0; i < mine.length; i++) {
      const current = mine[i];
      const next = mine[i + 1];
      if (!current) continue;
      current.end = next?.start ?? doc.retained?.length ?? null;
    }
  }

  const missed = located.filter((s) => s.start === null).length;
  if (missed > 0) {
    log.warn('plan', `${missed} of ${located.length} sections could not be located in their document`);
  }
  return located;
}

// ── Reading a scope ─────────────────────────────────────────────────────────

export interface ScopedText {
  text: string;
  /** What the screen calls this scope. */
  label: string;
  /**
   * False when a SECTION was asked for and Melete could only hand over its
   * whole document, because the anchor was never found. The caller says so;
   * silently widening the scope is how a student gets a fiche on the wrong
   * chapter and never learns why.
   */
  located: boolean;
}

/**
 * Every document of the course, each under its own name so the model can tell
 * them apart, joined in the order they were added.
 *
 * ⚖️ `excludeWeb` is not an option for tidiness: it is how the quiz keeps its
 * promise. Material fetched from the internet may inform a fiche or a map, and
 * must never end up in questions a student answers in an exam.
 */
export function courseText(course: Course, opts: { excludeWeb?: boolean } = {}): string {
  return course.docs
    .filter((d) => d.retained && !(opts.excludeWeb && d.sourceKind === 'web'))
    .map((d) => `## ${d.name}\n\n${d.retained ?? ''}`)
    .join('\n\n');
}

export function textForScope(course: Course, scope: Scope, opts: { excludeWeb?: boolean } = {}): ScopedText {
  if (scope.k === 'course') {
    return { text: courseText(course, opts), label: course.title, located: true };
  }
  // A section lives in ONE document, so a web section is excluded the same way.
  if (opts.excludeWeb) {
    const s = course.plan?.sections.find((x) => x.id === scope.sectionId);
    const d = s ? course.docs.find((x) => x.id === s.docId) : undefined;
    if (d?.sourceKind === 'web') return { text: '', label: s?.title ?? '', located: true };
  }
  const section = course.plan?.sections.find((s) => s.id === scope.sectionId);
  const doc = section ? course.docs.find((d) => d.id === section.docId) : undefined;
  if (!section || !doc?.retained) {
    return { text: '', label: section?.title ?? '', located: false };
  }
  if (section.start === null) {
    // Located nowhere: hand over the whole document and SAY the scope widened.
    return { text: doc.retained, label: section.title, located: false };
  }
  return {
    text: doc.retained.slice(section.start, section.end ?? undefined),
    label: section.title,
    located: true,
  };
}

// ── Reading what the model proposed ─────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

export interface ProposedPlan {
  title: string;
  subject: string;
  teacher: string;
  level: string;
  plan: Plan;
}

/**
 * Turns the model's proposal into a plan that points at real text.
 *
 * Returns null when nothing usable came back — a course with no sections is
 * not a plan, and offering an empty one to validate would be asking the human
 * to approve nothing.
 */
export function asProposedPlan(v: unknown, docs: Doc[], now: Date): ProposedPlan | null {
  if (!isObj(v)) return null;

  const rawSections = Array.isArray(v.sections) ? v.sections : [];
  const sections: Section[] = rawSections.slice(0, 24).map((s): Section | null => {
    if (!isObj(s)) return null;
    const title = text(s.title, 120);
    const anchor = text(s.anchor ?? s.startsWith, 200);
    if (!title || !anchor) return null;
    // The model names a document; we resolve it to an id ourselves, because a
    // model inventing an id would produce a section attached to nothing.
    const docName = text(s.document ?? s.doc, 200).toLowerCase();
    const doc = docs.find((d) => d.name.toLowerCase() === docName)
      ?? docs.find((d) => d.name.toLowerCase().includes(docName) && docName.length > 3)
      ?? docs[0];
    if (!doc) return null;
    return { id: newId('sec'), title, docId: doc.id, anchor, start: null, end: null };
  }).filter((s): s is Section => s !== null);

  if (sections.length === 0) return null;

  return {
    title: text(v.title, 160),
    subject: text(v.subject, 80),
    teacher: text(v.teacher, 80),
    level: text(v.level, 80),
    plan: {
      proposedAt: now.toISOString(),
      // 🚨 Proposed is not validated. Only the human's press sets this.
      validatedAt: null,
      sections: anchorSections(sections, docs),
    },
  };
}

/** How many sections of a plan Melete could actually find in the text. */
export function locatedCount(plan: Plan): number {
  return plan.sections.filter((s) => s.start !== null).length;
}
