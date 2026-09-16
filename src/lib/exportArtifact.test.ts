import { describe, expect, it } from 'vitest';
import {
  cardsToMarkdown, ficheToMarkdown, mapToMarkdown, quizToMarkdown, render, sketchToMarkdown, toHtml,
} from './exportArtifact';
import { htmlToText, domainOf, titleOf } from './web';
import type { Card, FicheDoc, MindMapDoc, QuizDoc, SketchDoc } from './types';

const PROV = { courseId: 'k1', createdAt: '', scope: { k: 'course' } as const };

const fiche: FicheDoc = {
  ...PROV, id: 'f1', title: 'Sources du droit',
  concepts: [
    { id: 'c1', title: 'Loi', line: 'Les actes ecrits.', quote: 'La loi au sens large' },
    { id: 'c2', title: 'Jurisprudence', line: 'Les tribunaux.' },
    { id: 'c3', title: 'Doctrine', line: 'Les auteurs.' },
  ],
  links: [{ from: 'c1', to: 'c2', label: 'appliquee par' }],
  glossary: [{ term: 'Ordonnance', definition: 'Acte du gouvernement.' }],
  remember: ['La doctrine ne cree pas le droit.'],
};

describe('ficheToMarkdown', () => {
  it('writes every region of the sheet', () => {
    const md = ficheToMarkdown(fiche);
    expect(md).toContain('# Sources du droit');
    expect(md).toContain('## 1. Loi');
    expect(md).toContain('> La loi au sens large');
    expect(md).toContain('Ordonnance');
    expect(md).toContain('La doctrine ne cree pas le droit.');
  });

  it('names the concepts a link joins, not their ids', () => {
    // "c1 → c2" in an exported file is unreadable a week later.
    const md = ficheToMarkdown(fiche);
    expect(md).toContain('Loi → Jurisprudence');
    expect(md).not.toContain('c1 → c2');
  });

  it('leaves out a region the sheet does not have', () => {
    const bare = ficheToMarkdown({ ...fiche, glossary: [], remember: [], links: [] });
    expect(bare).not.toContain('Glossaire');
    expect(bare).not.toContain('À retenir');
    expect(bare).not.toContain('Liens');
  });
});

describe('the other artifacts', () => {
  it('writes a mind map as a nested list', () => {
    const map: MindMapDoc = {
      ...PROV, id: 'm1', title: 'Sources',
      root: { id: 'r', label: 'Sources', children: [{ id: 'a', label: 'Loi', note: 'ecrite' }] },
    };
    const md = mapToMarkdown(map);
    expect(md).toContain('- **Sources**');
    expect(md).toContain('  - **Loi** — ecrite');
  });

  it('writes a comparison as a markdown table', () => {
    const sk: SketchDoc = {
      ...PROV, id: 's1', kind: 'compare', title: 'Comparaison',
      table: { items: ['A', 'B'], rows: [{ label: 'forme', cells: ['x', 'y'] }] },
    };
    const md = sketchToMarkdown(sk);
    expect(md).toContain('| | A | B |');
    expect(md).toContain('| **forme** | x | y |');
  });

  it('writes a quiz with the answer marked', () => {
    const quiz: QuizDoc = {
      ...PROV, id: 'q1', title: 'Test',
      questions: [{ id: 'x', prompt: 'Laquelle ?', choices: ['Un', 'Deux'], answer: 1, why: 'parce que' }],
    };
    const md = quizToMarkdown(quiz);
    expect(md).toContain('- A. Un');
    expect(md).toContain('**Réponse : B**');
    expect(md).toContain('parce que');
  });

  it('writes cards question then answer', () => {
    const cards: Card[] = [{
      id: 'c', courseId: 'k1', front: 'Quoi ?', back: 'Ceci.', box: 1,
      dueAt: '2026-01-01', reps: 0, lapses: 0, lastSeenAt: null,
    }];
    expect(cardsToMarkdown(cards, 'Deck')).toContain('## 1. Quoi ?');
  });
});

describe('render', () => {
  const md = ficheToMarkdown(fiche);

  it('gives markdown back untouched', () => {
    expect(render(md, 'x', 'md')).toBe(md);
  });

  it('strips the syntax for plain text but keeps the words', () => {
    const txt = render(md, 'x', 'txt');
    expect(txt).not.toContain('#');
    expect(txt).not.toContain('**');
    expect(txt).toContain('Sources du droit');
    expect(txt).toContain('Ordonnance');
  });

  it('produces a self-contained page with LITERAL colours', () => {
    const html = render(md, 'Sources', 'html');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Sources</title>');
    // 🚨 A var(--accent) would resolve to nothing outside the app and the file
    // would open unreadable. The export carries its own colours.
    expect(html).not.toContain('var(--');
    expect(html).toContain('#7c6bf5');
  });

  it('escapes markup that came from the course', () => {
    const html = toHtml('# <script>alert(1)</script>', 'x');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('web helpers', () => {
  it('accepts https only, because that is all the host will fetch', () => {
    expect(domainOf('https://www.legifrance.gouv.fr/x')).toBe('www.legifrance.gouv.fr');
    expect(domainOf('http://example.com')).toBeNull();
    expect(domainOf('not a url')).toBeNull();
  });

  it('reads a page title, and falls back to the domain rather than inventing one', () => {
    expect(titleOf('<html><title> Le  Code civil </title>', 'x.fr')).toBe('Le Code civil');
    expect(titleOf('<html><body>no title</body>', 'x.fr')).toBe('x.fr');
  });

  it('strips markup without splitting a word an inline tag sits inside', () => {
    expect(htmlToText('<p>M<sup>me</sup> Lepic</p>')).toBe('Mme Lepic');
    expect(htmlToText('<p>Un</p><p>Deux</p>')).toMatch(/Un\s*\n\s*Deux/);
    expect(htmlToText('<script>var a=1</script><p>Texte</p>')).toBe('Texte');
  });
});
