/**
 * types.ts — the shapes Melete persists and renders.
 *
 * **v2: a course is a BINDER, not a document.** The first version made
 * `Course` and "one imported file" the same thing, and the first real user
 * said the obvious: a course is a set of documents. Everything else in this
 * file hangs off that correction — a plan points into a document, a scope
 * names a section, an artifact records which scope produced it.
 *
 * Three rules govern every field here:
 *
 *  1. **Absent is not zero.** Anything Melete has not measured is `null`,
 *     never `0`. A document whose passages were never counted has
 *     `chunks: null` and the UI renders `—`.
 *  2. **The source of a claim travels with it.** Every generated card, node
 *     and question carries the excerpt it came from.
 *  3. **What the human decided is marked as decided.** A plan Melete proposed
 *     and a plan the human validated are not the same object, and the
 *     difference is a timestamp nobody can fake into existence.
 */

/** Every artifact Melete can generate from a course. */
export type ArtifactKind = 'map' | 'sketch' | 'cards' | 'quiz' | 'digest' | 'fiche';

/** How a document's text got here. Decides what "re-read" is able to do. */
export type SourceKind =
  /** A PDF/DOCX/TXT the user picked — re-readable from disk. */
  | 'file'
  /** A photo of a lecture screen, OCR'd — re-readable from disk. */
  | 'photo'
  /** Text pasted in — nothing on disk to re-read. */
  | 'paste'
  /**
   * A page fetched from the internet, on a URL the human gave.
   *
   * ⚖️ It is a DIFFERENT kind on purpose. Web material is shown marked, and an
   * exam quiz is never generated from it: a student who writes back a source
   * their professor did not give is penalised, and it would be Melete that led
   * them there. See lib/web.ts for the whole rule.
   */
  | 'web';

/** One document inside a course. */
export interface Doc {
  id: string;
  name: string;
  sourceKind: SourceKind;
  sourcePath: string | null;
  /** Characters of text actually extracted. */
  chars: number;
  ocr: boolean;
  /** True when the HOST truncated the extraction (a very long document). */
  truncated: boolean;
  /** How the host read the bytes ('cp1252', 'utf-16le'…). Absent for a PDF or
   *  a DOCX, whose containers declare their own — absent is not 'utf-8'. */
  encoding?: string;
  /** Passages the vault accepted. `null` = never counted, NEVER 0 for unknown. */
  chunks: number | null;
  ingestedAt: string | null;
  addedAt: string;
  /** The slice kept for regeneration; dropped first when the budget runs out. */
  retained: string | null;
}

// ── The plan ────────────────────────────────────────────────────────────────

/**
 * One part of the course, as the plan describes it.
 *
 * 🚨 `anchor` is TEXT, not an index. Asking a model for character offsets gets
 * numbers that look right and point nowhere; asking it to quote the first
 * words of a section gives something we can SEARCH for, and whose failure to
 * match is detectable. `start`/`end` are what Melete found, and `null` means
 * it did not — a state the UI has to be able to say out loud.
 */
export interface Section {
  id: string;
  title: string;
  /** The document this section lives in. */
  docId: string;
  /** The first words of the section, as the model quoted them. */
  anchor: string;
  /** Character range located inside that document's text, or null if the
   *  anchor was never found (the section then falls back to the whole doc). */
  start: number | null;
  end: number | null;
}

export interface Plan {
  proposedAt: string;
  /** Set when the human pressed validate. `null` = proposed, not yet theirs. */
  validatedAt: string | null;
  sections: Section[];
}

/** How deep the student wants an artifact to go. */
export type Depth = 'overview' | 'course' | 'detail';

/**
 * What the student told Melete about what they need.
 *
 * These are DATA on the course, not screen state: they go back into every
 * prompt afterwards, and they stay editable without redoing the import.
 */
export interface Intent {
  /** Free text: "partiel dans trois semaines", "je reprends après une absence". */
  goal: string;
  /** What they say they already handle. */
  strong: string;
  /** What they say resists. This is the one that steers generation most. */
  weak: string;
  depth: Depth;
  answeredAt: string | null;
}

/** What a generation was asked to cover. */
export type Scope =
  | { k: 'course' }
  | { k: 'section'; sectionId: string };

export interface Course {
  id: string;
  title: string;
  subject: string;
  /** Free text, and often empty — an unknown teacher is a blank, never "N/A". */
  teacher: string;
  /** "L2 droit", "prépa", "M1" — free text, no enumeration to get wrong. */
  level: string;
  docs: Doc[];
  plan: Plan | null;
  intent: Intent | null;
  createdAt: string;
}

/**
 * An artifact as the PARSER produces it, before provenance is attached.
 *
 * The parser reads what the model said; only the caller knows which scope was
 * asked for and whether the whole of it fitted. Keeping those apart is what
 * stops a parser from having to be told things it cannot check.
 */
export type Draft<T extends Provenance> = Omit<T, 'scope' | 'complete' | 'feedback'>;

// ── Mind map ────────────────────────────────────────────────────────────────

export interface MapNode {
  id: string;
  label: string;
  note?: string;
  quote?: string;
  children?: MapNode[];
}

/** What every generated artifact records about how it came to be. */
export interface Provenance {
  courseId: string;
  createdAt: string;
  /** Which part of the course it was asked to cover. */
  scope: Scope;
  /**
   * false when only the head of the scoped text fitted the model budget.
   *
   * 🎭 ABSENT on an artifact carried over from v1, where nobody recorded it.
   * The UI shows the "read from the top" notice on `false` only — reading
   * absence as `false` would accuse an old artifact of being partial, and
   * reading it as `true` would promise something nobody measured.
   */
  complete?: boolean;
  /** The human's words on the previous version, if this is a regeneration. */
  feedback?: string;
}

export interface MindMapDoc extends Provenance {
  id: string;
  title: string;
  root: MapNode;
}

// ── Schema / sketchnote ─────────────────────────────────────────────────────

export type SketchKind = 'flow' | 'compare' | 'timeline';

export interface FlowStep {
  id: string;
  label: string;
  note?: string;
  branch?: { yes: string; no: string };
}

export interface CompareTable {
  items: string[];
  rows: { label: string; cells: string[] }[];
}

export interface TimelineEvent {
  id: string;
  /** Free text: "1804", "3rd century BC". Never parsed as a date. */
  when: string;
  label: string;
  note?: string;
}

export interface SketchDoc extends Provenance {
  id: string;
  kind: SketchKind;
  title: string;
  steps?: FlowStep[];
  table?: CompareTable;
  events?: TimelineEvent[];
}

// ── Flashcards ──────────────────────────────────────────────────────────────

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface Card {
  id: string;
  courseId: string;
  /** Which section produced it, when it came from a scoped generation. */
  sectionId?: string;
  front: string;
  back: string;
  quote?: string;
  box: LeitnerBox;
  /** ISO day the card comes back. */
  dueAt: string;
  reps: number;
  lapses: number;
  lastSeenAt: string | null;
  /** True when the human wrote or edited it — a hand-written card is never
   *  silently replaced by a regeneration. */
  edited?: boolean;
}

// ── Quiz ────────────────────────────────────────────────────────────────────

export interface Question {
  id: string;
  prompt: string;
  choices: string[];
  answer: number;
  why?: string;
  topic?: string;
  quote?: string;
}

export interface QuizDoc extends Provenance {
  id: string;
  title: string;
  questions: Question[];
}

export interface QuizAttempt {
  quizId: string;
  courseId: string;
  at: string;
  correct: number;
  total: number;
  missed: string[];
}

// ── Digest ──────────────────────────────────────────────────────────────────

export interface DigestDoc extends Provenance {
  id: string;
  keyPoints: string[];
  glossary: { term: string; definition: string }[];
}

// ── Fiche de révision ───────────────────────────────────────────────────────

/**
 * The revision sheet, as a COMPOSITION rather than a text.
 *
 * 🚨 This type exists because of a field report: the digest was asked for "3 to
 * 6 one-sentence key points and a glossary" and delivered exactly that — ten
 * lines of prose under a tab called "Fiche". In French a *fiche de révision* is
 * a visual object: one page, blocks, a hierarchy you take in at a glance. The
 * defect was the specification, not the model, so the fix is a different shape
 * of answer, not a better prompt for the same one.
 *
 * A region with nothing in it stays EMPTY. Padding a sheet to look balanced is
 * how a student revises a sentence the course never contained.
 */
export interface FicheConcept {
  id: string;
  /** 2 to 5 words. It is a heading on a card, not a sentence. */
  title: string;
  /** One line saying what it is. */
  line: string;
  quote?: string;
}

/** A relation the course states between two notions, by concept id. */
export interface FicheLink {
  from: string;
  to: string;
  /** Two or three words on the arrow ("prime", "s'oppose à"). */
  label?: string;
}

export interface FicheDoc extends Provenance {
  id: string;
  title: string;
  /** 3 to 6. Fewer than 3 is not a sheet, it is a note. */
  concepts: FicheConcept[];
  links: FicheLink[];
  glossary: { term: string; definition: string }[];
  /** 2 to 3 sentences — the only part of a fiche that is prose. */
  remember: string[];
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface Progress {
  xp: number;
  days: string[];
  badges: string[];
  dailyGoal: number;
  today: { day: string; reviewed: number } | null;
}

// ── The whole persisted blob ────────────────────────────────────────────────

export interface MeleteState {
  version: 2;
  courses: Course[];
  maps: MindMapDoc[];
  sketches: SketchDoc[];
  cards: Card[];
  quizzes: QuizDoc[];
  attempts: QuizAttempt[];
  digests: DigestDoc[];
  fiches: FicheDoc[];
  progress: Progress;
}

export function emptyState(): MeleteState {
  return {
    version: 2,
    courses: [],
    maps: [],
    sketches: [],
    cards: [],
    quizzes: [],
    attempts: [],
    digests: [],
    fiches: [],
    progress: { xp: 0, days: [], badges: [], dailyGoal: 20, today: null },
  };
}

// ── Reading a binder ────────────────────────────────────────────────────────

/** Characters across every document — the size of the course, not of a file. */
export function courseChars(course: Course): number {
  return course.docs.reduce((n, d) => n + d.chars, 0);
}

/** Passages in the vault, or null when NOTHING could be counted.
 *  🎭 A binder where one document filed 12 and another was never counted
 *  reports 12, not "unknown" — a partial measure is still a measure. */
export function coursePassages(course: Course): number | null {
  const counted = course.docs.filter((d) => d.chunks !== null);
  if (counted.length === 0) return null;
  return counted.reduce((n, d) => n + (d.chunks ?? 0), 0);
}

/** True once the human has made the plan theirs. */
export function planIsValidated(course: Course): boolean {
  return course.plan?.validatedAt != null;
}
