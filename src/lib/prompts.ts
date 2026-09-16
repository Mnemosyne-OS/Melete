/**
 * prompts.ts — what Melete asks the model for.
 *
 * Three constraints run through every prompt here, and each one exists because
 * of a way a study aid can quietly harm the student using it:
 *
 *  • **Answer in the language of the course.** A French law student handed
 *    English flashcards has to translate their own revision back, and the
 *    vocabulary they are being tested on is exactly what gets lost.
 *  • **Quote the source.** Every generated item carries a verbatim excerpt.
 *    It is the only thing standing between "revise this" and "revise this,
 *    which the model may have invented".
 *  • **Say less rather than invent more.** Explicitly permitted, in every
 *    prompt: return fewer items if the passage does not support them. A short
 *    honest deck beats a full one with four fabricated cards, because the
 *    student cannot tell which four.
 */

/** Shared preamble. Kept in one place so the honesty rules cannot drift apart
 *  between the five generators. */
const COMMON = `You are helping a student revise from their own course material.
Rules you must follow exactly:
1. Reply with JSON only. No prose, no markdown fence, no commentary.
2. Write every human-readable value in the SAME LANGUAGE as the course text below.
3. Use ONLY what the course text says. Never add outside knowledge, never invent
   a fact, a date, an article number or a definition that is not in the text.
4. If the text does not support the number of items asked for, return FEWER.
   A short accurate answer is correct; a padded one is a failure.
5. Where a "quote" field is asked for, copy a short VERBATIM fragment (max 200
   characters) from the course text that supports the item.`;

/**
 * What the student told Melete they need, and what they said about the last
 * attempt. Both travel into every prompt.
 *
 * 🚨 The feedback is repeated VERBATIM, never summarised. "trop court" and
 * "mets des exemples" are instructions; paraphrasing them is how a
 * regeneration quietly ignores what was asked and the person types it again.
 */
export interface PromptContext {
  /** The part of the course this covers, as the screen names it. */
  scopeLabel?: string;
  goal?: string;
  strong?: string;
  weak?: string;
  /**
   * What the quiz history shows they keep missing.
   *
   * 🚨 A DIFFERENT field from `weak`, on purpose. What somebody says
   * resists them and what they actually fail are two facts, and merging
   * them would let the app tell a student they are bad at something they
   * never said and never failed.
   */
  measuredWeak?: string;
  depth?: 'overview' | 'course' | 'detail';
  feedback?: string;
}

const DEPTH_LINE: Record<'overview' | 'course' | 'detail', string> = {
  overview: 'Keep to the level of an overview: the shape of the thing, not its details.',
  course: 'Aim for the level of the course itself: what a student must be able to state in an exam.',
  detail: 'Go into detail: the distinctions, the exceptions, the conditions the course insists on.',
};

function contextBlock(ctx: PromptContext): string {
  const lines: string[] = [];
  if (ctx.scopeLabel) lines.push(`This covers ONE part of a larger course: "${ctx.scopeLabel}". Do not summarise the rest.`);
  if (ctx.goal) lines.push(`What the student is working towards: ${ctx.goal}`);
  if (ctx.strong) lines.push(`What they say they already handle, so do not dwell on it: ${ctx.strong}`);
  if (ctx.weak) lines.push(`What they SAY resists them, so spend your effort here: ${ctx.weak}`);
  if (ctx.measuredWeak) lines.push(`What their quiz results SHOW they keep missing (topic, times missed out of attempts): ${ctx.measuredWeak}. Give these more room than the rest.`);
  if (ctx.depth) lines.push(DEPTH_LINE[ctx.depth]);
  if (ctx.feedback) lines.push(`They read your PREVIOUS answer and asked for this, in their own words: "${ctx.feedback}". Do what they asked.`);
  if (!lines.length) return '';
  return `\n\nABOUT THIS STUDENT AND THIS REQUEST:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

const wrap = (task: string, text: string, ctx: PromptContext = {}): string =>
  `${COMMON}${contextBlock(ctx)}\n\n${task}\n\n--- COURSE TEXT ---\n${text}\n--- END OF COURSE TEXT ---`;

/**
 * The plan proposal — the one prompt whose answer a human will CORRECT rather
 * than consume.
 *
 * It asks for an `anchor` (the opening words, copied) and never for a position:
 * plan.ts explains why a model's character offsets are worse than useless.
 */
export function planPrompt(docs: { name: string; text: string }[]): string {
  const body = docs.map((d) => `### DOCUMENT: ${d.name}\n${d.text}`).join('\n\n');
  return `${COMMON}

Read these documents, which together are ONE course, and describe its structure
so the student can correct it.
Return this exact JSON shape:
{"title":"the course's title","subject":"the discipline","teacher":"","level":"",
 "sections":[{"title":"a part of the course","document":"the DOCUMENT name it is in",
              "anchor":"the first 8 to 15 words of that part, copied EXACTLY"}]}
Rules for this task:
- "anchor" must be copied character for character from the document. It is how
  the app finds that part again; a paraphrase finds nothing.
- "document" must be one of the DOCUMENT names above, copied exactly.
- Between 3 and 12 sections. Follow the course's own headings where it has them.
- Fill "teacher" and "level" ONLY if the documents actually say so. Leave them
  empty otherwise: an invented professor is worse than a blank field.

--- DOCUMENTS ---
${body}
--- END OF DOCUMENTS ---`;
}

export function mindMapPrompt(text: string, title: string, ctx: PromptContext = {}): string {
  return wrap(
    `Build a mind map of this course, titled around "${title}".
Return this exact JSON shape:
{"title":"...","root":{"label":"the central idea","children":[
  {"label":"a main branch","note":"one sentence","quote":"verbatim","children":[
    {"label":"a sub-idea","note":"one sentence","quote":"verbatim"}]}]}}
Aim for 4 to 7 main branches, each with 2 to 5 children, at most 3 levels deep.
Labels are SHORT (2 to 6 words) — a mind map is read at a glance, not paragraph
by paragraph. Put the explanation in "note", never in "label".`,
    text,
    ctx,
  );
}

export function flowPrompt(text: string, ctx: PromptContext = {}): string {
  return wrap(
    `Extract the procedure, mechanism or reasoning chain this course describes,
as an ordered diagram. Return this exact JSON shape:
{"title":"...","steps":[
  {"label":"short step name","note":"one sentence"},
  {"label":"a question the process asks","branch":{"yes":"what follows","no":"what follows instead"}}]}
Between 3 and 8 steps. Use "branch" only where the course really describes a
condition with two outcomes. If this course describes no process at all, return
{"steps":[]} rather than inventing one.`,
    text,
    ctx,
  );
}

export function comparePrompt(text: string, ctx: PromptContext = {}): string {
  return wrap(
    `Build a comparison table of the notions this course contrasts.
Return this exact JSON shape:
{"title":"...","items":["notion A","notion B"],
 "rows":[{"label":"criterion","cells":["what A is","what B is"]}]}
2 to 4 items, 3 to 7 criteria. Every row must have exactly one cell per item.
If the course contrasts nothing, return {"items":[]} rather than inventing a
contrast.`,
    text,
    ctx,
  );
}

export function timelinePrompt(text: string, ctx: PromptContext = {}): string {
  return wrap(
    `Extract the chronology this course contains.
Return this exact JSON shape:
{"title":"...","events":[{"when":"1804","label":"short event","note":"one sentence"}]}
"when" is copied as the course writes it (a year, a century, a phase name) — do
not convert or normalise it, and never guess a date the text does not give.
If the course has no chronology, return {"events":[]}.`,
    text,
    ctx,
  );
}

export function cardsPrompt(text: string, count: number, ctx: PromptContext = {}): string {
  return wrap(
    `Write up to ${count} revision flashcards on this course.
Return this exact JSON shape:
{"cards":[{"front":"the question","back":"the answer","quote":"verbatim"}]}
"front" asks ONE thing and is answerable from memory — prefer "What does X
mean?" or "What are the three conditions of Y?" over "Explain chapter 2".
"back" is 1 to 3 sentences. Cover the definitions and the distinctions the
course insists on, not trivia.`,
    text,
    ctx,
  );
}

export function quizPrompt(text: string, count: number, ctx: PromptContext = {}): string {
  return wrap(
    `Write up to ${count} multiple-choice questions on this course.
Return this exact JSON shape:
{"title":"...","questions":[{"prompt":"...","choices":["A","B","C","D"],
  "answer":0,"why":"why that answer is right","topic":"2-4 word topic label",
  "quote":"verbatim"}]}
"answer" is the INDEX of the correct choice in "choices" (0-based).
The wrong choices must be plausible and drawn from the same course — a wrong
answer that is obviously absurd teaches nothing. "topic" is what the question
is about, so the student can be told what to revise again.`,
    text,
    ctx,
  );
}

/**
 * The revision sheet.
 *
 * 🚨 Written against a field report: the digest prompt below asked for "3 to 6
 * one-sentence key points and a glossary" and got exactly that — ten lines of
 * prose under a tab called "Fiche". So this one asks for a SHAPE: named blocks,
 * the relations between them, and only two or three sentences of actual prose
 * at the end. What comes back is composed on a page, not printed as a list.
 */
export function fichePrompt(text: string, title: string, ctx: PromptContext = {}): string {
  return wrap(
    `Build a one-page revision sheet for "${title}".
Return this exact JSON shape:
{"title":"...",
 "concepts":[{"id":"c1","title":"2 to 5 words","line":"one line saying what it is","quote":"verbatim"}],
 "links":[{"from":"c1","to":"c2","label":"2 or 3 words"}],
 "glossary":[{"term":"...","definition":"..."}],
 "remember":["a sentence the student must be able to state"]}
Rules for this task:
- 3 to 6 concepts. They are CARDS on a page: "title" is a heading, never a
  sentence, and "line" is one line — put nothing in either that needs a comma
  to survive.
- "links" only where the course really states a relation between two of YOUR
  concepts, using their ids. No link is better than an invented one.
- "remember" is 2 to 3 sentences and is the ONLY prose on the sheet.
- Leave "glossary" empty rather than defining words the course does not use.`,
    text,
    ctx,
  );
}
