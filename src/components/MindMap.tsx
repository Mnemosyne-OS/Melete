/**
 * MindMap.tsx — the drawing, and the two gestures that make it usable.
 *
 * A generated map is bigger than the window it opens in, always. So the two
 * things that matter here are not the aesthetics: they are that you can MOVE
 * it (drag) and CHANGE THE SCALE (wheel), and that folding a branch says how
 * much it folded away.
 *
 * 🚨 Zooming is anchored on the pointer, not on the centre. Zooming to the
 * centre moves whatever you were reading off the screen, which reads as the
 * map jumping every time you look closer.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { allBranchIds, layoutMindMap, linkPath, type LaidNode } from '../lib/mindmap';
import { estimateWidth, wrapLabel } from '../lib/text';
import { useI18n } from '../i18n/useI18n';
import { exportSvgToFolder } from '../lib/exportSvg';
import { T, ghostButton, meta, paper, small, subjectHue } from '../styles';
import type { MapNode, MindMapDoc } from '../lib/types';

/** Font sizes are in VIEWBOX units, and the viewBox is scaled to fit the frame.
 *  So what decides legibility is the ratio of these to the layout's extent, not
 *  the numbers themselves: a 13px label on a 1500-unit map lands at about 9
 *  real pixels, which is where the first draft was unreadable. */
const FONT = 17;
const ROOT_FONT = 22;
const LINE_H = 21;

interface View { x: number; y: number; k: number }

/** Which top-level branch each node belongs to, so a branch keeps one colour
 *  from its root to its leaves — that is what lets the eye follow it. */
function branchIndexById(root: MapNode): Map<string, number> {
  const out = new Map<string, number>();
  (root.children ?? []).forEach((child, i) => {
    const walk = (n: MapNode): void => {
      out.set(n.id, i);
      (n.children ?? []).forEach(walk);
    };
    walk(child);
  });
  return out;
}

function nodeBox(n: LaidNode): { w: number; h: number; lines: string[] } {
  const isRoot = n.depth === 0;
  const maxChars = isRoot ? 22 : 20;
  const lines = wrapLabel(n.label, maxChars, 2);
  const font = isRoot ? ROOT_FONT : FONT;
  const widest = lines.reduce((w, l) => Math.max(w, estimateWidth(l, font)), 0);
  return { w: Math.max(80, widest + 32), h: lines.length * LINE_H + (isRoot ? 22 : 16), lines };
}

export function MindMap({ doc, subject }: { doc: MindMapDoc; subject: string }): JSX.Element {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  // Starts at 1: the viewBox already fits the whole map into the frame, so any
  // smaller default is a second shrink on top of that one.
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [exported, setExported] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const layout = useMemo(() => layoutMindMap(doc.root, collapsed), [doc.root, collapsed]);
  const branchOf = useMemo(() => branchIndexById(doc.root), [doc.root]);
  const hue = subjectHue(subject);
  const branchCount = Math.max(1, doc.root.children?.length ?? 1);

  // A pointer released outside the frame must still end the drag; without this
  // the map keeps following the mouse after the button is up.
  useEffect(() => {
    const stop = (): void => { drag.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const colorFor = (n: LaidNode): string => {
    if (n.depth === 0) return `hsl(${hue} 70% 66%)`;
    const i = branchOf.get(n.id) ?? 0;
    return `hsl(${(hue + (i * 360) / branchCount) % 360} 62% 64%)`;
  };

  const toggle = (n: LaidNode): void => {
    setSelected(n.id);
    if (n.childCount === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      return next;
    });
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const k = Math.min(2.4, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      // Keep the point under the cursor fixed: solve for the translation that
      // maps the same world point to the same screen point at the new scale.
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  };

  const selectedNode = layout.nodes.find((n) => n.id === selected) ?? null;

  const doExport = async (): Promise<void> => {
    const svg = svgRef.current;
    if (!svg) return;
    const res = await exportSvgToFolder(svg, doc.title);
    setExported(res.ok ? res.path : res.code === 'CANCELLED' ? null : (res.detail ?? res.code));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={ghostButton} onClick={() => setCollapsed(new Set())}>{t('map.expandAll')}</button>
        <button style={ghostButton} onClick={() => setCollapsed(new Set(allBranchIds(doc.root).slice(1)))}>
          {t('map.collapseAll')}
        </button>
        <button style={ghostButton} onClick={() => setView({ x: 0, y: 0, k: 1 })}>{t('map.reset')}</button>
        <div style={{ flex: 1 }} />
        <button style={ghostButton} onClick={() => void doExport()}>{t('map.export')}</button>
      </div>

      {exported && <p style={{ ...meta, margin: 0 }}>{exported}</p>}

      <div
        style={{ ...paper, height: '58vh', minHeight: '360px', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
      >
        <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={doc.title}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {layout.links.map((l) => (
              <path
                key={`${l.from}-${l.to}`}
                d={linkPath(l)}
                fill="none"
                stroke={colorFor(layout.nodes.find((n) => n.id === l.to) ?? layout.nodes[0]!)}
                strokeOpacity={0.45}
                strokeWidth={Math.max(1.2, 4 - l.depth)}
                strokeLinecap="round"
              />
            ))}

            {layout.nodes.map((n) => {
              const { w, h, lines } = nodeBox(n);
              const isRoot = n.depth === 0;
              const color = colorFor(n);
              const isSelected = n.id === selected;
              return (
                <g key={n.id} transform={`translate(${n.x - w / 2} ${n.y - h / 2})`} style={{ cursor: 'pointer' }} onClick={() => toggle(n)}>
                  <rect
                    width={w}
                    height={h}
                    rx={h / 2}
                    fill={isRoot ? color : 'var(--bg-panel, #17151f)'}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  {lines.map((line, i) => (
                    <text
                      key={i}
                      x={w / 2}
                      y={h / 2 - ((lines.length - 1) * LINE_H) / 2 + i * LINE_H + (isRoot ? 5 : 4)}
                      textAnchor="middle"
                      fontSize={isRoot ? ROOT_FONT : FONT}
                      fontWeight={isRoot ? 700 : 500}
                      fill={isRoot ? '#12101a' : 'var(--text-primary, #ece9f5)'}
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {line}
                    </text>
                  ))}
                  {n.collapsed && n.childCount > 0 && (
                    <g transform={`translate(${w + 8} ${h / 2})`}>
                      <circle r={11} fill={color} />
                      <text textAnchor="middle" y={4} fontSize={11} fontWeight={700} fill="#12101a" fontFamily="Inter, system-ui, sans-serif">
                        {n.childCount}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selectedNode && (selectedNode.note ?? selectedNode.quote) && (
        <div style={detailStyle}>
          <strong style={{ fontSize: '14px' }}>{selectedNode.label}</strong>
          {selectedNode.note && <p style={{ ...small, color: T.text, margin: 0, lineHeight: 1.6 }}>{selectedNode.note}</p>}
          {selectedNode.quote && (
            <blockquote style={quoteStyle}>
              <span style={{ ...meta, display: 'block', marginBottom: '4px' }}>{t('map.sourceQuote')}</span>
              {selectedNode.quote}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

const detailStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '12px',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const quoteStyle: CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderLeft: `2px solid ${T.accent}`,
  background: 'var(--bg-void, #0e0d13)',
  borderRadius: '0 8px 8px 0',
  fontSize: '13px',
  lineHeight: 1.6,
  color: T.muted,
  fontStyle: 'italic',
};
