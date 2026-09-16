/**
 * mindmap.ts — the radial layout, as pure arithmetic.
 *
 * It lives apart from the component for one reason: a layout bug is invisible
 * in a screenshot review (everything looks like a mind map) and obvious in a
 * test (two siblings on the same angle). jsdom cannot tell us whether the
 * drawing is readable, but it can tell us whether the numbers are right.
 *
 * Angular space is shared by LEAF COUNT, not by child count. A branch with one
 * child that has nine grandchildren needs nine slots, and giving every branch
 * an equal slice is what makes generated maps overlap on the dense side.
 */
import type { MapNode } from './types';

export interface LaidNode {
  id: string;
  label: string;
  note?: string;
  quote?: string;
  depth: number;
  x: number;
  y: number;
  /** Radians, 0 = east. Used to place the label on the outside of the node. */
  angle: number;
  parentId: string | null;
  /** Children the node HAS, whether or not they are currently drawn. */
  childCount: number;
  collapsed: boolean;
}

export interface Link {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
}

export interface MapLayout {
  nodes: LaidNode[];
  links: Link[];
  width: number;
  height: number;
}

/** Distance from the centre for each depth. The gaps shrink with depth because
 *  a ring's circumference grows with its radius — equal gaps would leave the
 *  outer rings sparse and the inner ones crowded. */
const RADIUS = [0, 190, 340, 460, 560];

function radiusAt(depth: number): number {
  return RADIUS[depth] ?? (RADIUS[RADIUS.length - 1] ?? 560) + (depth - RADIUS.length + 1) * 90;
}

/** Drawn leaves under a node — a collapsed node counts as one leaf. */
function leafCount(node: MapNode, collapsed: Set<string>): number {
  const kids = collapsed.has(node.id) ? [] : (node.children ?? []);
  if (kids.length === 0) return 1;
  return kids.reduce((n, k) => n + leafCount(k, collapsed), 0);
}

/**
 * Lays the tree out around its root.
 *
 * `collapsed` holds node ids whose children are hidden. They still report a
 * `childCount`, so the view can draw the "+3" affordance that says something is
 * folded rather than absent — an absent branch and a folded one look identical
 * otherwise, and the student concludes the generation was thin.
 */
export function layoutMindMap(root: MapNode, collapsed: Set<string> = new Set()): MapLayout {
  const nodes: LaidNode[] = [];
  const links: Link[] = [];

  const place = (node: MapNode, a0: number, a1: number, depth: number, parentId: string | null): void => {
    const angle = (a0 + a1) / 2;
    const r = radiusAt(depth);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const kids = node.children ?? [];
    const isCollapsed = collapsed.has(node.id);

    nodes.push({
      id: node.id,
      label: node.label,
      ...(node.note ? { note: node.note } : {}),
      ...(node.quote ? { quote: node.quote } : {}),
      depth,
      x,
      y,
      angle,
      parentId,
      childCount: kids.length,
      collapsed: isCollapsed,
    });

    if (parentId !== null) {
      const parent = nodes.find((n) => n.id === parentId);
      if (parent) links.push({ from: parentId, to: node.id, x1: parent.x, y1: parent.y, x2: x, y2: y, depth });
    }

    if (isCollapsed || kids.length === 0) return;

    const total = kids.reduce((n, k) => n + leafCount(k, collapsed), 0);
    let cursor = a0;
    for (const kid of kids) {
      const share = (leafCount(kid, collapsed) / total) * (a1 - a0);
      place(kid, cursor, cursor + share, depth + 1, node.id);
      cursor += share;
    }
  };

  // Start the first branch at the top and go clockwise: a map read from 12
  // o'clock matches how the outline was written, so branch 1 is where the eye
  // starts rather than wherever the maths happened to land it.
  place(root, -Math.PI / 2, (3 * Math.PI) / 2, 0, null);

  // Recentre on the real extent, with room for the labels that stick out past
  // the node centres.
  // Room for the labels, which stick out past the node centres. Kept tight:
  // padding is dead space that the fit-to-frame scaling pays for by shrinking
  // the drawing, so every unit here costs legibility.
  const pad = 140;
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;

  const shift = (n: LaidNode): LaidNode => ({ ...n, x: n.x - minX, y: n.y - minY });
  return {
    nodes: nodes.map(shift),
    links: links.map((l) => ({ ...l, x1: l.x1 - minX, y1: l.y1 - minY, x2: l.x2 - minX, y2: l.y2 - minY })),
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Every node id in a tree — used to fold/unfold everything at once. */
export function allBranchIds(node: MapNode): string[] {
  const kids = node.children ?? [];
  if (!kids.length) return [];
  return [node.id, ...kids.flatMap(allBranchIds)];
}

/**
 * A cubic path from parent to child that leaves the parent radially.
 *
 * A straight line between two points on different rings crosses the ring
 * between them and reads as a connection to whatever it passes over. Bending
 * along the radius keeps each link inside its own angular sector.
 */
export function linkPath(l: Link): string {
  const mx = (l.x1 + l.x2) / 2;
  const my = (l.y1 + l.y2) / 2;
  return `M ${l.x1.toFixed(1)} ${l.y1.toFixed(1)} Q ${mx.toFixed(1)} ${l.y1.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} T ${l.x2.toFixed(1)} ${l.y2.toFixed(1)}`;
}
