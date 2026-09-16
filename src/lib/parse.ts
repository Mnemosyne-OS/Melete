/**
 * parse.ts — turning what a model actually returns into something we can draw.
 *
 * A model asked for JSON returns JSON *most* of the time. The rest of the time
 * it returns JSON inside a fence, JSON after a sentence of preamble, or JSON
 * with a trailing comma. Those three are worth repairing because the content is
 * intact and only the wrapper is wrong.
 *
 * 🚨 What is NOT repaired here is missing content. Every `as*` reader below
 * returns `null` when the shape is not there, and the UI says the generation
 * failed. Inventing a node, a card or a plausible fourth answer would produce
 * an artifact that looks exactly like a real one and teaches a student
 * something the course never said — the single worst thing this app could do.
 */
import type {
  Card, CompareTable, Draft, FicheConcept, FicheDoc, FicheLink, FlowStep, MapNode, MindMapDoc,
  Question, QuizDoc, SketchDoc, SketchKind, TimelineEvent,
} from './types';
import { newId } from './id';

/** Strips fences/preamble and parses. Returns null rather than throwing. */
export function parseLoose(raw: string): unknown {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let s = raw.trim();

  // ```json … ``` or ``` … ```
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(s);
  if (fence?.[1]) s = fence[1].trim();

  // Preamble/postamble around the object or array.
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);
  const lastObj = s.lastIndexOf('}');
  const lastArr = s.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);

  const attempts = [
    s,
    // Trailing commas before a closer — the single most common model slip.
    s.replace(/,(\s*[}\]])/g, '$1'),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Not this variant — fall through to the next repair, then to null.
      continue;
    }
  }
  return null;
}

// ── Small readers ───────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, max = 400): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

function strArray(v: unknown, max = 400): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, max)).filter((x): x is string => x !== null);
}

// ── Mind map ────────────────────────────────────────────────────────────────

/** Depth beyond which a radial map stops being readable on a laptop screen. */
const MAX_MAP_DEPTH = 4;
const MAX_CHILDREN = 8;

function asNode(v: unknown, depth: number): MapNode | null {
  if (!isObj(v)) return null;
  const label = str(v.label ?? v.title ?? v.name, 90);
  if (!label) return null;
  const note = str(v.note ?? v.detail ?? v.description, 300);
  const quote = str(v.quote ?? v.source, 400);
  const rawKids = Array.isArray(v.children) ? v.children : [];
  const children = depth >= MAX_MAP_DEPTH
    ? []
    : rawKids.slice(0, MAX_CHILDREN).map((k) => asNode(k, depth + 1)).filter((k): k is MapNode => k !== null);
  return {
    id: newId('n'),
    label,
    ...(note ? { note } : {}),
    ...(quote ? { quote } : {}),
    ...(children.length ? { children } : {}),
  };
}

export function asMindMap(v: unknown, courseId: string, now: Date): Draft<MindMapDoc> | null {
  const src = isObj(v) && isObj(v.root) ? v.root : v;
  const root = asNode(src, 0);
  // A map with no branches is a title, not a map — refuse it so the student
  // retries instead of staring at a lone bubble and concluding the app is bad.
  if (!root || !root.children?.length) return null;
  return {
    id: newId('map'),
    courseId,
    title: (isObj(v) ? str(v.title, 120) : null) ?? root.label,
    createdAt: now.toISOString(),
    root,
  };
}

// ── Schema ──────────────────────────────────────────────────────────────────

function asFlow(v: Record<string, unknown>): FlowStep[] {
  const raw = Array.isArray(v.steps) ? v.steps : [];
  return raw.slice(0, 12).map((s) => {
    if (!isObj(s)) return null;
    const label = str(s.label ?? s.title, 80);
    if (!label) return null;
    const note = str(s.note, 160);
    const b = isObj(s.branch) ? s.branch : null;
    const yes = b ? str(b.yes, 60) : null;
    const no = b ? str(b.no, 60) : null;
    return {
      id: newId('s'),
      label,
      ...(note ? { note } : {}),
      ...(yes && no ? { branch: { yes, no } } : {}),
    } satisfies FlowStep;
  }).filter((s): s is FlowStep => s !== null);
}

function asCompare(v: Record<string, unknown>): CompareTable | null {
  const table = isObj(v.table) ? v.table : v;
  const items = strArray(table.items ?? table.columns, 60).slice(0, 4);
  const rawRows = Array.isArray(table.rows) ? table.rows : [];
  if (items.length < 2) return null;
  const rows = rawRows.slice(0, 10).map((r) => {
    if (!isObj(r)) return null;
    const label = str(r.label ?? r.criterion, 80);
    if (!label) return null;
    const cells = strArray(r.cells, 160);
    // A row that does not span every column would render as a gap the student
    // reads as "no difference". Pad with an explicit em dash instead.
    const padded = items.map((_, i) => cells[i] ?? '—');
    return { label, cells: padded };
  }).filter((r): r is { label: string; cells: string[] } => r !== null);
  return rows.length ? { items, rows } : null;
}

function asTimeline(v: Record<string, unknown>): TimelineEvent[] {
  const raw = Array.isArray(v.events) ? v.events : [];
  return raw.slice(0, 12).map((e) => {
    if (!isObj(e)) return null;
    const when = str(e.when ?? e.date ?? e.year, 30);
    const label = str(e.label ?? e.title, 90);
    if (!when || !label) return null;
    const note = str(e.note, 180);
    return { id: newId('e'), when, label, ...(note ? { note } : {}) } satisfies TimelineEvent;
  }).filter((e): e is TimelineEvent => e !== null);
}

export function asSketch(v: unknown, kind: SketchKind, courseId: string, now: Date): Draft<SketchDoc> | null {
  if (!isObj(v)) return null;
  const base = {
    id: newId('sk'),
    courseId,
    kind,
    title: str(v.title, 120) ?? '',
    createdAt: now.toISOString(),
  };
  if (kind === 'flow') {
    const steps = asFlow(v);
    return steps.length >= 2 ? { ...base, steps } : null;
  }
  if (kind === 'compare') {
    const table = asCompare(v);
    return table ? { ...base, table } : null;
  }
  const events = asTimeline(v);
  return events.length >= 2 ? { ...base, events } : null;
}

// ── Cards ───────────────────────────────────────────────────────────────────

export function asCards(v: unknown, courseId: string): Pick<Card, 'id' | 'courseId' | 'front' | 'back'>[] {
  const raw = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.cards) ? v.cards : [];
  return raw.slice(0, 40).map((c) => {
    if (!isObj(c)) return null;
    const front = str(c.front ?? c.question, 240);
    const back = str(c.back ?? c.answer, 600);
    if (!front || !back) return null;
    const quote = str(c.quote, 400);
    return { id: newId('c'), courseId, front, back, ...(quote ? { quote } : {}) };
  }).filter((c): c is Pick<Card, 'id' | 'courseId' | 'front' | 'back'> & { quote?: string } => c !== null);
}

// ── Quiz ────────────────────────────────────────────────────────────────────

export function asQuiz(v: unknown, courseId: string, now: Date): Draft<QuizDoc> | null {
  const raw = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.questions) ? v.questions : [];
  const questions = raw.slice(0, 20).map((q) => {
    if (!isObj(q)) return null;
    const prompt = str(q.prompt ?? q.question, 300);
    const choices = strArray(q.choices ?? q.options, 200).slice(0, 5);
    // Two choices is the floor: a single-option "question" is a statement, and
    // an answer index outside the list would render a quiz nobody can pass.
    if (!prompt || choices.length < 2) return null;
    const rawAnswer = typeof q.answer === 'number' ? q.answer : Number(q.answer);
    if (!Number.isInteger(rawAnswer) || rawAnswer < 0 || rawAnswer >= choices.length) return null;
    const why = str(q.why ?? q.explanation, 400);
    const topic = str(q.topic, 60);
    const quote = str(q.quote, 400);
    return {
      id: newId('q'),
      prompt,
      choices,
      answer: rawAnswer,
      ...(why ? { why } : {}),
      ...(topic ? { topic } : {}),
      ...(quote ? { quote } : {}),
    } satisfies Question;
  }).filter((q): q is Question => q !== null);

  if (questions.length < 2) return null;
  return {
    id: newId('quiz'),
    courseId,
    title: (isObj(v) ? str(v.title, 120) : null) ?? '',
    createdAt: now.toISOString(),
    questions,
  };
}

// ── Fiche de révision ───────────────────────────────────────────────────────

/**
 * Reads a revision sheet.
 *
 * Refuses under three concepts: two cards on a page is a note, and drawing it
 * as a sheet would promise a composition the content cannot fill. Links whose
 * endpoints are not among the concepts are dropped here rather than at layout
 * time, so the stored artifact never carries an edge to nothing.
 *
 * ⚠️ There is no `asDigest` any more: the sheet replaced the text summary, so
 * its reader and its prompt went with it. `DigestDoc` itself stays, because
 * digests already in a student's library are still displayed read-only under
 * "the earlier text summary" — removing the type would delete their work.
 */
export function asFiche(v: unknown, courseId: string, now: Date): Draft<FicheDoc> | null {
  if (!isObj(v)) return null;

  const rawConcepts = Array.isArray(v.concepts) ? v.concepts : [];
  const concepts = rawConcepts.slice(0, 6).map((c) => {
    if (!isObj(c)) return null;
    const title = str(c.title ?? c.name, 60);
    const line = str(c.line ?? c.text ?? c.description, 200);
    if (!title || !line) return null;
    const id = str(c.id, 24) ?? newId('fc');
    const quote = str(c.quote, 400);
    return { id, title, line, ...(quote ? { quote } : {}) } satisfies FicheConcept;
  }).filter((c): c is FicheConcept => c !== null);

  if (concepts.length < 3) return null;

  const ids = new Set(concepts.map((c) => c.id));
  const rawLinks = Array.isArray(v.links) ? v.links : [];
  const links = rawLinks.slice(0, 8).map((l) => {
    if (!isObj(l)) return null;
    const from = str(l.from, 24);
    const to = str(l.to, 24);
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) return null;
    const label = str(l.label, 40);
    return { from, to, ...(label ? { label } : {}) } satisfies FicheLink;
  }).filter((l): l is FicheLink => l !== null);

  const rawGloss = Array.isArray(v.glossary) ? v.glossary : [];
  const glossary = rawGloss.slice(0, 10).map((g) => {
    if (!isObj(g)) return null;
    const term = str(g.term ?? g.word, 60);
    const definition = str(g.definition ?? g.meaning, 300);
    return term && definition ? { term, definition } : null;
  }).filter((g): g is { term: string; definition: string } => g !== null);

  return {
    id: newId('fiche'),
    courseId,
    createdAt: now.toISOString(),
    title: str(v.title, 120) ?? concepts[0]?.title ?? '',
    concepts,
    links,
    glossary,
    remember: strArray(v.remember ?? v.toRemember, 300).slice(0, 3),
  };
}
