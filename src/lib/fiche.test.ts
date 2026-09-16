import { describe, expect, it } from 'vitest';
import { arrowPath, layoutFiche, SHEET_W } from './fiche';
import { asFiche } from './parse';
import type { FicheDoc } from './types';

const NOW = new Date(2026, 8, 1);

function sheet(over: Partial<FicheDoc> = {}): FicheDoc {
  return {
    id: 'f1', courseId: 'k1', createdAt: '', scope: { k: 'course' },
    title: 'Les sources du droit',
    concepts: [
      { id: 'c1', title: 'Loi au sens large', line: 'Constitution, lois, ordonnances.' },
      { id: 'c2', title: 'Jurisprudence', line: 'Application du droit par les tribunaux.' },
      { id: 'c3', title: 'Doctrine', line: 'Propose et systematise.' },
    ],
    links: [{ from: 'c1', to: 'c2', label: 'appliquee par' }],
    glossary: [{ term: 'Ordonnance', definition: 'Acte du gouvernement subordonne a la loi.' }],
    remember: ['Ni la jurisprudence ni la doctrine ne creent le droit.'],
    ...over,
  };
}

describe('layoutFiche', () => {
  it('lays the concepts out two per row, both the same height', () => {
    const l = layoutFiche(sheet(), 'Droit civil');
    expect(l.boxes).toHaveLength(3);
    expect(l.boxes[0]?.y).toBe(l.boxes[1]?.y);
    expect(l.boxes[0]?.h).toBe(l.boxes[1]?.h);
    // The third starts a new row, lower down.
    expect(l.boxes[2]?.y).toBeGreaterThan(l.boxes[0]?.y ?? 0);
  });

  it('keeps every card inside the sheet', () => {
    const l = layoutFiche(sheet(), 'x');
    for (const b of l.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(SHEET_W);
      expect(b.y + b.h).toBeLessThanOrEqual(l.height);
    }
  });

  it('grows the sheet for a card whose line needs more rows', () => {
    const short = layoutFiche(sheet(), 'x').height;
    const long = layoutFiche(sheet({
      concepts: [
        { id: 'c1', title: 'Loi au sens large', line: 'Une phrase beaucoup plus longue '.repeat(6) },
        { id: 'c2', title: 'Jurisprudence', line: 'Court.' },
        { id: 'c3', title: 'Doctrine', line: 'Court.' },
      ],
    }), 'x').height;
    expect(long).toBeGreaterThan(short);
  });

  it('takes NO space for a block the course did not fill', () => {
    const full = layoutFiche(sheet(), 'x');
    const noGloss = layoutFiche(sheet({ glossary: [] }), 'x');
    const bare = layoutFiche(sheet({ glossary: [], remember: [] }), 'x');
    expect(noGloss.gloss).toBeNull();
    expect(noGloss.height).toBeLessThan(full.height);
    expect(bare.remember).toBeNull();
    expect(bare.height).toBeLessThan(noGloss.height);
  });

  it('drops a link that points at a concept which is not on the sheet', () => {
    // The model sometimes invents a seventh notion in the links. Drawing an
    // arrow to nowhere is worse than drawing no arrow.
    const l = layoutFiche(sheet({ links: [{ from: 'c1', to: 'ghost' }, { from: 'c1', to: 'c2' }] }), 'x');
    expect(l.arrows).toHaveLength(1);
    expect(l.arrows[0]?.to).toBe('c2');
  });

  it('drops a link from a concept to itself', () => {
    expect(layoutFiche(sheet({ links: [{ from: 'c1', to: 'c1' }] }), 'x').arrows).toHaveLength(0);
  });

  it('starts an arrow on the edge of its card, never inside it', () => {
    const l = layoutFiche(sheet(), 'x');
    const a = l.arrows[0]!;
    const from = l.boxes.find((b) => b.id === 'c1')!;
    const insideX = a.x1 > from.x + 1 && a.x1 < from.x + from.w - 1;
    const insideY = a.y1 > from.y + 1 && a.y1 < from.y + from.h - 1;
    expect(insideX && insideY).toBe(false);
  });

  it('caps at six concepts rather than running off the page', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, title: `T${i}`, line: 'x' }));
    expect(layoutFiche(sheet({ concepts: many }), 'x').boxes).toHaveLength(6);
  });

  it('wraps a long title instead of letting it run past the band', () => {
    const l = layoutFiche(sheet({ title: 'Un titre de cours vraiment tres long qui ne tient pas sur une seule ligne du tout' }), 'x');
    expect(l.titleLines.length).toBeGreaterThan(1);
    expect(l.titleLines.length).toBeLessThanOrEqual(2);
  });
});

describe('arrowPath', () => {
  it('bows away from the straight line', () => {
    const d = arrowPath({ from: 'a', to: 'b', x1: 0, y1: 0, x2: 100, y2: 0, labelX: 50, labelY: 0 });
    expect(d).toMatch(/^M 0\.0 0\.0 Q /);
    // A straight Q control point at y=0 would mean no bow at all.
    expect(d).not.toContain('Q 50.0 0.0');
  });
});

describe('asFiche', () => {
  const reply = {
    title: 'Sources',
    concepts: [
      { id: 'c1', title: 'Loi', line: 'Les actes ecrits.', quote: 'La loi au sens large' },
      { id: 'c2', title: 'Jurisprudence', line: 'Les tribunaux.' },
      { id: 'c3', title: 'Doctrine', line: 'Les auteurs.' },
    ],
    links: [{ from: 'c1', to: 'c2', label: 'appliquee' }],
    glossary: [{ term: 'Ordonnance', definition: 'Acte du gouvernement.' }],
    remember: ['La doctrine ne cree pas le droit.'],
  };

  it('reads a well-formed sheet', () => {
    const out = asFiche(reply, 'k1', NOW);
    expect(out?.concepts).toHaveLength(3);
    expect(out?.links).toHaveLength(1);
    expect(out?.remember).toHaveLength(1);
    expect(out?.concepts[0]?.quote).toBe('La loi au sens large');
  });

  it('REFUSES fewer than three concepts — two cards is a note, not a sheet', () => {
    expect(asFiche({ ...reply, concepts: reply.concepts.slice(0, 2) }, 'k1', NOW)).toBeNull();
    expect(asFiche({ concepts: [] }, 'k1', NOW)).toBeNull();
    expect(asFiche('nope', 'k1', NOW)).toBeNull();
  });

  it('drops a link whose endpoint is not one of the concepts', () => {
    const out = asFiche({ ...reply, links: [{ from: 'c1', to: 'c9' }, { from: 'c2', to: 'c3' }] }, 'k1', NOW);
    expect(out?.links).toHaveLength(1);
  });

  it('drops a concept with no line — a heading alone says nothing', () => {
    const out = asFiche({
      ...reply,
      concepts: [...reply.concepts, { id: 'c4', title: 'Vide' }],
    }, 'k1', NOW);
    expect(out?.concepts).toHaveLength(3);
  });

  it('keeps an empty glossary empty rather than inventing vocabulary', () => {
    const out = asFiche({ ...reply, glossary: [] }, 'k1', NOW);
    expect(out?.glossary).toEqual([]);
  });

  it('caps remember at three sentences — it is the only prose allowed', () => {
    const out = asFiche({ ...reply, remember: ['a', 'b', 'c', 'd', 'e'] }, 'k1', NOW);
    expect(out?.remember).toHaveLength(3);
  });
});
