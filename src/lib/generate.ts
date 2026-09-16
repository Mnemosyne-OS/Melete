/**
 * generate.ts — one generation, start to finish, with the four ways it fails
 * kept apart.
 *
 * 🎭 They are kept apart because they are four different next steps for the
 * student, and merging them into "generation failed" sends three people out of
 * four to do the one thing that cannot help them:
 *
 *   NO_TEXT       → the course text is gone; re-import the document.
 *   MODEL_FAILED  → no model answered; check Settings → Intelligence.
 *   UNUSABLE_JSON → a model answered, but not with structure; try again, or a
 *                   bigger model. (Small local models fail here the most.)
 *   EMPTY_RESULT  → a model answered with valid structure and nothing in it.
 *                   Usually a passage with no chronology / no comparison in it,
 *                   which is a fact about the course, not a bug.
 *
 * Since v2 every generation is SCOPED: it covers the whole binder or one
 * section of the validated plan, and it carries what the student said they
 * need (their intent) plus what they said about the previous version (their
 * feedback). All three ride into the prompt and all three are recorded on the
 * artifact, so "why does this one look like that?" has an answer.
 */
import { infer } from './host';
import { modelSlice } from './chunk';
import { log } from './log';
import { textForScope } from './plan';
import { measuredWeakness, weakTopics } from './weak';
import { asCards, asFiche, asMindMap, asQuiz, asSketch, parseLoose } from './parse';
import {
  cardsPrompt, comparePrompt, fichePrompt, flowPrompt, mindMapPrompt, planPrompt,
  quizPrompt, timelinePrompt, type PromptContext,
} from './prompts';
import { asProposedPlan, type ProposedPlan } from './plan';
import type {
  Card, Course, FicheDoc, MindMapDoc, Provenance, QuizAttempt, QuizDoc, Scope, SketchDoc, SketchKind,
} from './types';

export type GenFailure = 'NO_TEXT' | 'MODEL_FAILED' | 'UNUSABLE_JSON' | 'EMPTY_RESULT';

export type GenResult<T> =
  | { ok: true; value: T; complete: boolean }
  | { ok: false; code: GenFailure; detail?: string };

/**
 * How much course text one generation reads.
 *
 * 12 000 characters is chosen for the SMALL end of the range: a 3B local model
 * with a 4k context cannot take more, and a budget that only works on a cloud
 * model would make the offline promise false. What changed in v2 is not the
 * number but WHERE it is spent: a scoped generation reads its section, so a
 * long course is covered by several targeted passes instead of one blind slice
 * off the top.
 */
const SLICE = 12_000;

/** The plan proposal gets a wider window: it has to see the shape of the whole
 *  thing, and it produces short anchors rather than prose. */
const PLAN_SLICE = 20_000;

async function run<T>(
  kind: string,
  prompt: string,
  slice: { text: string; complete: boolean },
  read: (v: unknown) => T | null,
  maxTokens: number,
): Promise<GenResult<T>> {
  if (!slice.text) {
    log.warn('generate', `${kind}: no source text`);
    return { ok: false, code: 'NO_TEXT' };
  }
  log.info('generate', `${kind}: asking the model`, {
    chars: slice.text.length, complete: slice.complete, maxTokens,
  });

  let raw: string;
  const t0 = Date.now();
  try {
    raw = await infer({ prompt, temperature: 0.2, maxTokens });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error('generate', `${kind}: no model answered`, { detail });
    return { ok: false, code: 'MODEL_FAILED', detail };
  }
  log.info('generate', `${kind}: model replied`, { chars: raw.length, ms: Date.now() - t0 });

  const parsed = parseLoose(raw);
  if (parsed === null) {
    // The reply itself is NOT logged: it can carry the course text verbatim.
    log.warn('generate', `${kind}: reply carried no usable JSON`, { chars: raw.length });
    return { ok: false, code: 'UNUSABLE_JSON' };
  }

  const value = read(parsed);
  if (value === null) {
    log.warn('generate', `${kind}: JSON was valid but held nothing to draw`);
    return { ok: false, code: 'EMPTY_RESULT' };
  }
  log.info('generate', `${kind}: done`, { complete: slice.complete });
  return { ok: true, value, complete: slice.complete };
}

// ── The plan ────────────────────────────────────────────────────────────────

/**
 * Proposes a structure for the whole binder.
 *
 * ⚠️ What comes back is a PROPOSAL: `plan.validatedAt` is null and stays null
 * until the human presses validate. Nothing downstream may treat a proposal as
 * a decision.
 */
export async function generatePlan(course: Course, now: Date): Promise<GenResult<ProposedPlan>> {
  const readable = course.docs.filter((d) => d.retained);
  if (!readable.length) return { ok: false, code: 'NO_TEXT' };

  // The window is shared between the documents so that a five-document binder
  // does not spend it all on the first one and propose a plan for a fifth of
  // the course.
  const per = Math.max(1200, Math.floor(PLAN_SLICE / readable.length));
  let complete = true;
  const docs = readable.map((d) => {
    const s = modelSlice(d.retained ?? '', per);
    if (!s.complete) complete = false;
    return { name: d.name, text: s.text };
  });

  return run(
    'plan',
    planPrompt(docs),
    { text: docs.map((d) => d.text).join(''), complete },
    (v) => asProposedPlan(v, course.docs, now),
    2500,
  );
}

// ── Artifacts ───────────────────────────────────────────────────────────────

/** Everything a scoped generation needs to know, resolved once by the caller. */
export interface GenContext {
  course: Course;
  scope: Scope;
  now: Date;
  /** Every attempt in the library; the weakness is measured from this
   *  course's own, never from another's. */
  attempts?: QuizAttempt[];
  /** The human's words on the version they just read, if any. */
  feedback?: string;
}

/** The intent, the scope label and the feedback, as the prompt wants them. */
function promptContext(c: GenContext): PromptContext {
  const scoped = textForScope(c.course, c.scope);
  const intent = c.course.intent;
  const measured = measuredWeakness(weakTopics(c.attempts ?? [], c.course.id));
  return {
    ...(c.scope.k === 'section' ? { scopeLabel: scoped.label } : {}),
    ...(intent?.goal ? { goal: intent.goal } : {}),
    ...(intent?.strong ? { strong: intent.strong } : {}),
    ...(intent?.weak ? { weak: intent.weak } : {}),
    ...(intent ? { depth: intent.depth } : {}),
    ...(measured ? { measuredWeak: measured } : {}),
    ...(c.feedback ? { feedback: c.feedback } : {}),
  };
}

/** The provenance every artifact carries. Built once, from the same facts the
 *  prompt was built from — so what the screen says matches what was asked. */
function provenance(c: GenContext, complete: boolean): Provenance {
  return {
    courseId: c.course.id,
    createdAt: c.now.toISOString(),
    scope: c.scope,
    complete,
    ...(c.feedback ? { feedback: c.feedback } : {}),
  };
}

function scopedSlice(c: GenContext, opts: { excludeWeb?: boolean } = {}): { text: string; complete: boolean; located: boolean } {
  const scoped = textForScope(c.course, c.scope, opts);
  const cut = modelSlice(scoped.text.trim(), SLICE);
  return { ...cut, located: scoped.located };
}

export async function generateMindMap(c: GenContext): Promise<GenResult<MindMapDoc>> {
  const slice = scopedSlice(c);
  const ctx = promptContext(c);
  const title = c.scope.k === 'section' ? (ctx.scopeLabel ?? c.course.title) : c.course.title;
  const res = await run('map', mindMapPrompt(slice.text, title, ctx), slice,
    (v) => asMindMap(v, c.course.id, c.now), 3000);
  return res.ok ? { ...res, value: { ...res.value, ...provenance(c, res.complete) } } : res;
}

export async function generateSketch(c: GenContext, kind: SketchKind): Promise<GenResult<SketchDoc>> {
  const slice = scopedSlice(c);
  const ctx = promptContext(c);
  const prompt = kind === 'flow' ? flowPrompt(slice.text, ctx)
    : kind === 'compare' ? comparePrompt(slice.text, ctx)
      : timelinePrompt(slice.text, ctx);
  const res = await run(`sketch:${kind}`, prompt, slice,
    (v) => asSketch(v, kind, c.course.id, c.now), 2500);
  return res.ok ? { ...res, value: { ...res.value, ...provenance(c, res.complete) } } : res;
}

export async function generateCards(
  c: GenContext, count: number,
): Promise<GenResult<Pick<Card, 'id' | 'courseId' | 'front' | 'back'>[]>> {
  const slice = scopedSlice(c);
  return run('cards', cardsPrompt(slice.text, count, promptContext(c)), slice, (v) => {
    const cards = asCards(v, c.course.id);
    if (!cards.length) return null;
    // A card knows which part of the course it came from, so a deck can later
    // be reviewed section by section.
    return c.scope.k === 'section'
      ? cards.map((card) => ({ ...card, sectionId: c.scope.k === 'section' ? c.scope.sectionId : undefined }))
      : cards;
  }, 4000);
}

export async function generateQuiz(c: GenContext, count: number): Promise<GenResult<QuizDoc>> {
  // ⚖️ The one generator that refuses web material outright (lib/web.ts).
  const slice = scopedSlice(c, { excludeWeb: true });
  const res = await run('quiz', quizPrompt(slice.text, count, promptContext(c)), slice,
    (v) => asQuiz(v, c.course.id, c.now), 4000);
  return res.ok ? { ...res, value: { ...res.value, ...provenance(c, res.complete) } } : res;
}

export async function generateFiche(c: GenContext): Promise<GenResult<FicheDoc>> {
  const slice = scopedSlice(c);
  const ctx = promptContext(c);
  const title = c.scope.k === 'section' ? (ctx.scopeLabel ?? c.course.title) : c.course.title;
  const res = await run('fiche', fichePrompt(slice.text, title, ctx), slice,
    (v) => asFiche(v, c.course.id, c.now), 3000);
  return res.ok ? { ...res, value: { ...res.value, ...provenance(c, res.complete) } } : res;
}
