/**
 * exportArtifact.ts — getting the work OUT, in the formats that are real.
 *
 * 🚨 What the cartridge can write is not a matter of effort. `dialog.writeFile`
 * takes a UTF-8 string and an extension allowlist (`md txt json csv xml html
 * css svg`), so **pdf, jpeg, docx and odt cannot be written at all** — not
 * "hard", impossible without a new host action (doc 103 §7). A button offering
 * PDF and producing HTML would be a button that works and lies, so this module
 * offers exactly what it can produce:
 *
 *   • **Markdown** — the format that pastes into Notion, Obsidian, anything.
 *   • **Plain text** — the same content with the syntax taken out.
 *   • **HTML** — styled, self-contained, and the honest route to a PDF: the
 *     student opens it and prints to PDF from their browser. The UI says that
 *     in words rather than implying it.
 *   • **SVG** — for the drawings, handled by exportSvg.ts.
 *   • **PNG** — rendered from the SVG, and saved into Melete's own vault folder
 *     rather than where the student chooses, because that is the only image
 *     write a cartridge has. The UI says where it went.
 */
import type { Card, FicheDoc, MindMapDoc, QuizDoc, SketchDoc, MapNode } from './types';

export type TextFormat = 'md' | 'txt' | 'html';

/** Strips the markdown syntax, keeping the structure readable as plain text. */
function demarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/^\|(.+)\|$/gm, (_, row: string) => row.split('|').map((c) => c.trim()).join('  '))
    .replace(/^\|?[-\s|:]+\|?$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── One markdown writer per artifact ────────────────────────────────────────

export function ficheToMarkdown(doc: FicheDoc): string {
  const out = [`# ${doc.title}`, ''];
  doc.concepts.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.title}`, '', c.line, '');
    if (c.quote) out.push(`> ${c.quote}`, '');
  });
  if (doc.links.length) {
    const name = (id: string): string => doc.concepts.find((c) => c.id === id)?.title ?? id;
    out.push('## Liens', '');
    for (const l of doc.links) out.push(`- ${name(l.from)} → ${name(l.to)}${l.label ? ` (${l.label})` : ''}`);
    out.push('');
  }
  if (doc.glossary.length) {
    out.push('## Glossaire', '');
    for (const g of doc.glossary) out.push(`- **${g.term}** — ${g.definition}`);
    out.push('');
  }
  if (doc.remember.length) {
    out.push('## À retenir', '');
    for (const r of doc.remember) out.push(`- ${r}`);
  }
  return out.join('\n').trim();
}

export function mapToMarkdown(doc: MindMapDoc): string {
  const walk = (n: MapNode, depth: number): string[] => {
    const pad = '  '.repeat(depth);
    const lines = [`${pad}- **${n.label}**${n.note ? ` — ${n.note}` : ''}`];
    for (const child of n.children ?? []) lines.push(...walk(child, depth + 1));
    return lines;
  };
  return [`# ${doc.title}`, '', ...walk(doc.root, 0)].join('\n');
}

export function sketchToMarkdown(doc: SketchDoc): string {
  const out = [`# ${doc.title || 'Schéma'}`, ''];
  if (doc.steps) {
    doc.steps.forEach((s, i) => {
      out.push(`${i + 1}. **${s.label}**${s.note ? ` — ${s.note}` : ''}`);
      if (s.branch) out.push(`   - oui → ${s.branch.yes}`, `   - non → ${s.branch.no}`);
    });
  }
  if (doc.table) {
    out.push(`| | ${doc.table.items.join(' | ')} |`);
    out.push(`|---|${doc.table.items.map(() => '---').join('|')}|`);
    for (const row of doc.table.rows) out.push(`| **${row.label}** | ${row.cells.join(' | ')} |`);
  }
  if (doc.events) {
    for (const e of doc.events) out.push(`- **${e.when}** — ${e.label}${e.note ? ` (${e.note})` : ''}`);
  }
  return out.join('\n').trim();
}

export function cardsToMarkdown(cards: Card[], title: string): string {
  const out = [`# ${title}`, ''];
  cards.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.front}`, '', c.back, '');
    if (c.quote) out.push(`> ${c.quote}`, '');
  });
  return out.join('\n').trim();
}

export function quizToMarkdown(doc: QuizDoc): string {
  const out = [`# ${doc.title || 'Quiz'}`, ''];
  doc.questions.forEach((q, i) => {
    out.push(`## ${i + 1}. ${q.prompt}`, '');
    q.choices.forEach((choice, j) => out.push(`- ${String.fromCharCode(65 + j)}. ${choice}`));
    out.push('', `**Réponse : ${String.fromCharCode(65 + q.answer)}**${q.why ? ` — ${q.why}` : ''}`, '');
  });
  return out.join('\n').trim();
}

// ── Wrapping ────────────────────────────────────────────────────────────────

/** A self-contained page. Styles are INLINE and colours are literal: the file
 *  leaves the app, so a `var(--accent)` would resolve to nothing in a browser
 *  and the export would open black on black. */
export function toHtml(markdown: string, title: string): string {
  const esc = (s: string): string => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = markdown.split('\n').map((line) => {
    if (/^# /.test(line)) return `<h1>${esc(line.slice(2))}</h1>`;
    if (/^## /.test(line)) return `<h2>${esc(line.slice(3))}</h2>`;
    if (/^> /.test(line)) return `<blockquote>${esc(line.slice(2))}</blockquote>`;
    if (/^\s*- /.test(line)) return `<li>${bold(esc(line.replace(/^\s*- /, '')))}</li>`;
    if (/^\|/.test(line)) return `<div class="row">${esc(line)}</div>`;
    if (!line.trim()) return '';
    return `<p>${bold(esc(line))}</p>`;
  }).join('\n');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
 body{max-width:46em;margin:3em auto;padding:0 1.5em;font:16px/1.65 Georgia,serif;color:#1b1a20;background:#fff}
 h1{font-size:1.9em;margin:0 0 .2em;border-bottom:3px solid #7c6bf5;padding-bottom:.3em}
 h2{font-size:1.15em;margin:1.6em 0 .3em;color:#4a3fb5}
 li{margin:.25em 0}
 blockquote{margin:.4em 0;padding:.4em .9em;border-left:3px solid #cfc9f5;color:#55505f;font-style:italic}
 .row{font-family:ui-monospace,monospace;font-size:.9em;white-space:pre}
 @media print{body{margin:0;max-width:none}}
</style></head><body>
${body}
</body></html>`;
}

function bold(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** The bytes to write for a chosen format, from one markdown source. */
export function render(markdown: string, title: string, format: TextFormat): string {
  if (format === 'md') return markdown;
  if (format === 'txt') return demarkdown(markdown);
  return toHtml(markdown, title);
}
