import { describe, expect, it } from 'vitest';
import { allBranchIds, layoutMindMap } from './mindmap';
import type { MapNode } from './types';

const tree: MapNode = {
  id: 'root',
  label: 'Law',
  children: [
    { id: 'a', label: 'Statute', children: [{ id: 'a1', label: 'Federal' }, { id: 'a2', label: 'Cantonal' }] },
    { id: 'b', label: 'Case law' },
  ],
};

describe('layoutMindMap', () => {
  it('places the root and every node inside the reported box', () => {
    const layout = layoutMindMap(tree);
    expect(layout.nodes).toHaveLength(5);
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(layout.width);
      expect(n.y).toBeLessThanOrEqual(layout.height);
    }
  });

  it('never puts two siblings on the same angle', () => {
    const layout = layoutMindMap(tree);
    const angles = layout.nodes.filter((n) => n.depth === 1).map((n) => n.angle);
    expect(new Set(angles).size).toBe(angles.length);
  });

  it('shares the circle by LEAF count, so the dense branch gets more room', () => {
    // 🧬 The tree matters. `tree` above CANNOT tell the two rules apart: its
    // branches have as many leaves as children, so counting either way gives
    // 2:1 and a per-child split passes. This one has a branch with ONE child
    // carrying THREE grandchildren — leaves 3:1, children 1:1 — which is
    // exactly the shape that overlaps on screen when the rule is wrong.
    const lopsided: MapNode = {
      id: 'root',
      label: 'Law',
      children: [
        { id: 'a', label: 'Statute', children: [{ id: 'a1', label: 'Federal', children: [
          { id: 'x', label: 'x' }, { id: 'y', label: 'y' }, { id: 'z', label: 'z' },
        ] }] },
        { id: 'b', label: 'Case law' },
      ],
    };
    const layout = layoutMindMap(lopsided);
    const a = layout.nodes.find((n) => n.id === 'a')!;
    const b = layout.nodes.find((n) => n.id === 'b')!;

    // A full turn from -90°, split 3:1. 'Statute' owns 3π/2 of it, centred at
    // -π/2 + 3π/4 = π/4; 'Case law' owns π/2, centred at π + π/4 = 5π/4.
    // A per-child split would put them at 0 and π.
    expect(a.angle).toBeCloseTo(Math.PI / 4, 5);
    expect(b.angle).toBeCloseTo((5 * Math.PI) / 4, 5);
  });

  it('puts deeper nodes further from the centre', () => {
    const layout = layoutMindMap(tree);
    const root = layout.nodes.find((n) => n.id === 'root')!;
    const d1 = layout.nodes.find((n) => n.id === 'a')!;
    const d2 = layout.nodes.find((n) => n.id === 'a1')!;
    const r = (n: { x: number; y: number }): number => Math.hypot(n.x - root.x, n.y - root.y);
    expect(r(d2)).toBeGreaterThan(r(d1));
  });

  it('hides the children of a folded node but still reports how many there are', () => {
    const layout = layoutMindMap(tree, new Set(['a']));
    expect(layout.nodes.map((n) => n.id)).not.toContain('a1');
    const a = layout.nodes.find((n) => n.id === 'a')!;
    expect(a.collapsed).toBe(true);
    expect(a.childCount).toBe(2);
  });

  it('links every node except the root to a parent', () => {
    const layout = layoutMindMap(tree);
    expect(layout.links).toHaveLength(layout.nodes.length - 1);
    for (const l of layout.links) {
      expect(layout.nodes.some((n) => n.id === l.from)).toBe(true);
      expect(layout.nodes.some((n) => n.id === l.to)).toBe(true);
    }
  });

  it('survives a root with no children at all', () => {
    const layout = layoutMindMap({ id: 'lonely', label: 'Alone' });
    expect(layout.nodes).toHaveLength(1);
    expect(layout.links).toHaveLength(0);
    expect(layout.width).toBeGreaterThan(0);
  });
});

describe('allBranchIds', () => {
  it('names every node that HAS children, root first', () => {
    expect(allBranchIds(tree)).toEqual(['root', 'a']);
  });
});
