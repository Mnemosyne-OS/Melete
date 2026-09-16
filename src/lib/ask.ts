/**
 * ask.ts — putting a question to a course.
 *
 * 🚨 This does NOT go through the host's RAG. It could: Melete writes every
 * passage into its vault, and `model.infer` takes a `vaultId`. But that vault
 * holds EVERY course the cartridge ever filed, so a question about civil law
 * would happily retrieve a passage from a biochemistry deck and answer with it.
 * A study aid that mixes two courses is worse than one that cannot search.
 *
 * So the retrieval happens here, over the documents of THIS binder, and the
 * answer is generated with the host's RAG explicitly off. The consequence is
 * stated rather than hidden: it searches what Melete kept, not the whole vault,
 * and a passage the storage budget released is a passage it cannot read.
 *
 * The ranking is keyword overlap, not embeddings. It is what a cartridge can do
 * offline, in a few milliseconds, with no model call — and for one course of a
 * few dozen passages it is enough. ⛔ It is not semantic: a question phrased in
 * words the course never uses will find nothing, and the answer says so instead
 * of inventing one.
 */
import { chunkText } from './chunk';
import { infer } from './host';
import { log } from './log';
import { textForScope } from './plan';
import type { Course, Scope } from './types';

/** Words too common to tell two passages apart, in the three shipped languages
 *  plus the ones a course title drags in. Not a linguistic stopword list — a
 *  list of words that would make every passage look equally relevant. */
const NOISE = new Set([
  'the', 'and', 'that', 'this', 'with', 'for', 'from', 'what', 'which', 'was', 'are', 'not', 'but',
  'les', 'des', 'une', 'que', 'qui', 'dans', 'pour', 'par', 'sur', 'est', 'sont', 'aux', 'avec',
  'ce', 'cette', 'ces', 'son', 'ses', 'leur', 'plus', 'pas', 'comme', 'tout', 'tous',
  'los', 'las', 'una', 'con', 'por', 'para', 'como', 'del', 'sus', 'este', 'esta',
]);

/** Content words of a string, folded and de-accented so "hiérarchie" matches
 *  "hierarchie" — a student typing a question rarely types the accents. */
export function terms(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));
}

export interface Passage {
  text: string;
  /** How many distinct question terms this passage carries. */
  hits: number;
}

/**
 * The passages of `text` most likely to answer `question`, best first.
 *
 * Scores on DISTINCT terms rather than on total occurrences: a passage that
 * repeats one word forty times is not a better answer than one that mentions
 * three of the four things asked about, and raw counts say the opposite.
 */
export function selectPassages(text: string, question: string, budget: number): Passage[] {
  const wanted = new Set(terms(question));
  if (wanted.size === 0) return [];

  const scored = chunkText(text, 1200)
    .map((chunk) => {
      const present = new Set(terms(chunk).filter((w) => wanted.has(w)));
      return { text: chunk, hits: present.size };
    })
    .filter((p) => p.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const out: Passage[] = [];
  let used = 0;
  for (const p of scored) {
    if (used + p.text.length > budget) continue;
    out.push(p);
    used += p.text.length;
  }
  return out;
}

export type AskFailure =
  /** Nothing in the course text matches the question. */
  | 'NOTHING_FOUND'
  /** The course has no readable text at all (budget released it). */
  | 'NO_TEXT'
  | 'MODEL_FAILED';

export type AskResult =
  | { ok: true; answer: string; passages: Passage[] }
  | { ok: false; code: AskFailure; detail?: string };

/** How much retrieved text goes into one answer. */
const ASK_BUDGET = 8_000;

export async function askCourse(course: Course, scope: Scope, question: string): Promise<AskResult> {
  const text = textForScope(course, scope).text.trim();
  if (!text) return { ok: false, code: 'NO_TEXT' };

  const passages = selectPassages(text, question, ASK_BUDGET);
  log.info('ask', 'retrieved', { question: question.length, passages: passages.length });

  // 🚨 Nothing retrieved means the course does not talk about it in these
  // words. Asking the model anyway would get a fluent answer from its general
  // knowledge, presented as if it came from the student's course — the exact
  // failure this app exists not to have.
  if (passages.length === 0) return { ok: false, code: 'NOTHING_FOUND' };

  const body = passages.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n');
  const prompt = `A student is asking about their own course. Answer ONLY from the
passages below, which come from that course.

Rules you must follow exactly:
1. Answer in the SAME LANGUAGE as the question.
2. Use only what the passages say. If they do not answer the question, say so
   plainly in one sentence and stop. Never fill the gap from general knowledge.
3. Cite the passages you used as [1], [2] inline.
4. Be brief: a few sentences, not an essay.

QUESTION: ${question}

--- PASSAGES FROM THE COURSE ---
${body}
--- END OF PASSAGES ---`;

  try {
    const answer = await infer({ prompt, temperature: 0.1, maxTokens: 1200 });
    return { ok: true, answer, passages };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error('ask', 'no model answered', { detail });
    return { ok: false, code: 'MODEL_FAILED', detail };
  }
}
