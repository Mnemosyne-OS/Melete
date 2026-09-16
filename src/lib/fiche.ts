/**
 * fiche.ts — the layout of a revision sheet, as pure arithmetic.
 *
 * The sheet is drawn in SVG, and SVG has no text layout: a `<text>` element is
 * one line forever and overflows its box in silence. So every wrap, every box
 * height and every band position is computed HERE, where a test can look at it,
 * rather than in the component where it would only be checkable by eye.
 *
 * The composition is FIXED — title band, a grid of concept cards, the links
 * between them, a definitions block, a "remember" band, always in that order.
 * That constancy is what makes a fiche readable at a glance: the eye learns
 * where things are once, and every later sheet pays that back.
 *
 * 🎭 A region with nothing in it takes NO SPACE. An empty "definitions" heading
 * over blank paper reads as a feature that failed; a sheet that simply does not
 * have that block reads as a course that had no vocabulary to isolate.
 */
import { wrapLabel } from './text';
import type { FicheDoc } from './types';

export const SHEET_W = 1000;
const MARGIN = 40;
const GAP = 24;

const TITLE_H = 92;
const CARD_W = (SHEET_W - MARGIN * 2 - GAP) / 2;
const CARD_PAD = 16;
const CARD_TITLE_LH = 24;
const CARD_BODY_LH = 19;
/** Characters per line at the card's body size, measured against CARD_W. */
const CARD_TITLE_CHARS = 26;
const CARD_BODY_CHARS = 46;

const GLOSS_LH = 19;
const GLOSS_DEF_CHARS = 58;

const REMEMBER_LH = 22;
const REMEMBER_CHARS = 88;

export interface FicheBox {
  id: string;
  titleLines: string[];
  bodyLines: string[];
  quote?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FicheArrow {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  labelX: number;
  labelY: number;
}

export interface GlossRow {
  term: string;
  defLines: string[];
  y: number;
  h: number;
}

export interface FicheLayout {
  width: number;
  height: number;
  titleLines: string[];
  subtitle: string;
  boxes: FicheBox[];
  arrows: FicheArrow[];
  /** Absent when the course had no vocabulary to isolate. */
  gloss: { y: number; h: number; rows: GlossRow[] } | null;
  /** Absent when the model gave nothing to remember. */
  remember: { y: number; h: number; lines: string[] } | null;
}

/** Where an arrow should leave a box, aimed at another one. */
function edgePoint(box: FicheBox, towardsX: number, towardsY: number): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = towardsX - cx;
  const dy = towardsY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // Leave through the side the target actually lies on, so an arrow never
  // starts inside the card it comes from.
  const sx = Math.abs(dx) / (box.w / 2);
  const sy = Math.abs(dy) / (box.h / 2);
  const k = 1 / Math.max(sx, sy);
  return { x: cx + dx * k, y: cy + dy * k };
}

export function layoutFiche(doc: FicheDoc, subtitle: string): FicheLayout {
  const titleLines = wrapLabel(doc.title, 42, 2);
  let y = TITLE_H + GAP;

  // ── concept cards, two per row, each as tall as its own text needs ────────
  const boxes: FicheBox[] = [];
  const concepts = doc.concepts.slice(0, 6);
  for (let i = 0; i < concepts.length; i += 2) {
    const row = concepts.slice(i, i + 2);
    const cells = row.map((c) => {
      const tl = wrapLabel(c.title, CARD_TITLE_CHARS, 2);
      const bl = wrapLabel(c.line, CARD_BODY_CHARS, 4);
      return { c, tl, bl, h: CARD_PAD * 2 + tl.length * CARD_TITLE_LH + bl.length * CARD_BODY_LH };
    });
    // Both cards of a row share the taller height: a ragged grid reads as a
    // layout accident rather than as two ideas of unequal length.
    const rowH = Math.max(...cells.map((c) => c.h));
    cells.forEach((cell, j) => {
      boxes.push({
        id: cell.c.id,
        titleLines: cell.tl,
        bodyLines: cell.bl,
        ...(cell.c.quote ? { quote: cell.c.quote } : {}),
        x: MARGIN + j * (CARD_W + GAP),
        y,
        w: CARD_W,
        h: rowH,
      });
    });
    y += rowH + GAP;
  }

  // ── links, drawn between the cards that are actually on the sheet ─────────
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const arrows: FicheArrow[] = [];
  for (const link of doc.links) {
    const a = byId.get(link.from);
    const b = byId.get(link.to);
    // A link naming a concept that is not on the sheet is dropped, not drawn to
    // nowhere — the model sometimes invents a seventh notion in the links.
    if (!a || !b || a.id === b.id) continue;
    const start = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2);
    const end = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
    arrows.push({
      from: link.from,
      to: link.to,
      x1: start.x, y1: start.y, x2: end.x, y2: end.y,
      ...(link.label ? { label: link.label } : {}),
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2,
    });
  }

  // ── definitions ──────────────────────────────────────────────────────────
  let gloss: FicheLayout['gloss'] = null;
  if (doc.glossary.length > 0) {
    const rows: GlossRow[] = [];
    let gy = y + 34; // room for the block heading
    for (const g of doc.glossary.slice(0, 10)) {
      const defLines = wrapLabel(g.definition, GLOSS_DEF_CHARS, 3);
      const h = Math.max(GLOSS_LH, defLines.length * GLOSS_LH) + 8;
      rows.push({ term: g.term, defLines, y: gy, h });
      gy += h;
    }
    gloss = { y, h: gy - y + 8, rows };
    y = gy + GAP;
  }

  // ── what to remember ─────────────────────────────────────────────────────
  let remember: FicheLayout['remember'] = null;
  if (doc.remember.length > 0) {
    const lines = doc.remember.flatMap((r) => wrapLabel(r, REMEMBER_CHARS, 3));
    const h = lines.length * REMEMBER_LH + 46;
    remember = { y, h, lines };
    y += h + GAP;
  }

  return {
    width: SHEET_W,
    height: Math.max(y + MARGIN - GAP, TITLE_H + MARGIN),
    titleLines,
    subtitle,
    boxes,
    arrows,
    gloss,
    remember,
  };
}

/** A gentle curve between two cards, bowed away from the straight line so two
 *  arrows between the same pair do not lie on top of each other. */
export function arrowPath(a: FicheArrow): string {
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(40, len / 6);
  const cx = mx - (dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M ${a.x1.toFixed(1)} ${a.y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${a.x2.toFixed(1)} ${a.y2.toFixed(1)}`;
}
