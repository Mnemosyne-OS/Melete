import { describe, expect, it } from 'vitest';
import { selectPassages, terms } from './ask';

const COURSE = [
  'La loi au sens large comprend la Constitution federale, les lois et les ordonnances. '.repeat(6),
  'La jurisprudence est l application du droit par les tribunaux. Le Tribunal federal tranche. '.repeat(6),
  'La hierarchie des normes veut qu une norme inferieure ne contredise pas une norme superieure. '.repeat(6),
].join('\n\n');

describe('terms', () => {
  it('keeps content words and drops the ones that tell nothing apart', () => {
    expect(terms('Que dit la hierarchie des normes ?')).toEqual(['dit', 'hierarchie', 'normes']);
  });

  it('folds accents, because a student rarely types them in a question', () => {
    expect(terms('hiérarchie')).toEqual(terms('hierarchie'));
    expect(terms('Constitution fédérale')).toEqual(['constitution', 'federale']);
  });

  it('drops words too short to identify anything', () => {
    expect(terms('a b de la')).toEqual([]);
  });
});

describe('selectPassages', () => {
  it('brings back the passage that carries the question words', () => {
    const found = selectPassages(COURSE, 'Que dit la hierarchie des normes ?', 8000);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.text).toContain('hierarchie');
  });

  it('returns NOTHING when the course never uses those words', () => {
    // The honest outcome, and the one the caller turns into "your course does
    // not talk about this" instead of letting a model answer from elsewhere.
    expect(selectPassages(COURSE, 'photosynthese chloroplaste', 8000)).toEqual([]);
  });

  it('returns nothing for a question with no content words at all', () => {
    expect(selectPassages(COURSE, 'et alors ?', 8000)).toEqual([]);
  });

  it('scores on DISTINCT terms, so repetition does not beat coverage', () => {
    // 🧬 The shape matters. An earlier version of this test used a short text
    // that chunkText kept as ONE passage, so any ranking rule passed it. Two
    // real chunks are needed: the first repeats a single matching word many
    // times, the second carries two DIFFERENT ones. Counting occurrences puts
    // the first on top; counting distinct terms puts the second, which is the
    // one that actually answers.
    // Long enough that chunkText really produces two passages (its size is 1200).
    const noisy = 'normes '.repeat(170);
    const useful = 'La hierarchie classe la constitution au-dessus des lois.';
    const found = selectPassages(`${noisy}

${useful}`, 'hierarchie normes constitution', 8000);
    expect(found.length).toBeGreaterThan(1);
    expect(found[0]?.text).toContain('hierarchie');
    // 3 distinct terms in the second passage (the overlap carries 'normes'
    // over) against 1 in the first, while the first has ~170 occurrences.
    expect(found[0]?.hits).toBe(3);
  });

  it('stays inside the budget it was given', () => {
    const found = selectPassages(COURSE, 'loi jurisprudence hierarchie normes tribunaux', 1500);
    const total = found.reduce((n, p) => n + p.text.length, 0);
    expect(total).toBeLessThanOrEqual(1500);
  });

  it('survives an empty course and an empty question', () => {
    expect(selectPassages('', 'quoi que ce soit', 100)).toEqual([]);
    expect(selectPassages(COURSE, '', 100)).toEqual([]);
  });
});
