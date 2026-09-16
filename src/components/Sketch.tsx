/**
 * Sketch.tsx — the three schema shapes a course actually produces.
 *
 * A process and a chronology are DRAWINGS: their meaning is in the arrows and
 * the order, so they are SVG and they export as a file. A comparison is a
 * TABLE: its meaning is in the alignment of cells that wrap to different
 * heights, which SVG cannot do without eliding half the text. So it is HTML,
 * and it carries no export button.
 *
 * 🎭 That asymmetry is deliberate and visible. The alternative — an export
 * button on the table that produces a picture with every cell cut at 26
 * characters — would be a button that works and lies.
 */
import { useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { exportSvgToFolder } from '../lib/exportSvg';
import { estimateWidth, wrapLabel } from '../lib/text';
import { T, ghostButton, meta, paper, subjectColor } from '../styles';
import type { SketchDoc } from '../lib/types';

const BOX_W = 300;
const BOX_H = 62;
const GAP = 46;
const PAD = 30;

export function Sketch({ doc, subject }: { doc: SketchDoc; subject: string }): JSX.Element {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const accent = subjectColor(subject);

  const doExport = async (): Promise<void> => {
    const svg = svgRef.current;
    if (!svg) return;
    const res = await exportSvgToFolder(svg, doc.title || doc.kind);
    setExported(res.ok ? res.path : res.code === 'CANCELLED' ? null : (res.detail ?? res.code));
  };

  const exportable = doc.kind !== 'compare';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {doc.title && <strong style={{ fontSize: '15px' }}>{doc.title}</strong>}
        <span style={{ ...meta }}>{t(`sketch.kind${doc.kind === 'flow' ? 'Flow' : doc.kind === 'compare' ? 'Compare' : 'Timeline'}`)}</span>
        <div style={{ flex: 1 }} />
        {exportable && <button style={ghostButton} onClick={() => void doExport()}>{t('sketch.export')}</button>}
      </div>

      {exported && <p style={{ ...meta, margin: 0 }}>{exported}</p>}

      {doc.kind === 'compare'
        ? <CompareTableView doc={doc} accent={accent} />
        : (
          <div style={{ ...paper, padding: '12px', overflow: 'auto', maxHeight: '62vh' }}>
            {doc.kind === 'flow'
              ? <FlowView doc={doc} accent={accent} svgRef={svgRef} yes={t('sketch.yes')} no={t('sketch.no')} />
              : <TimelineView doc={doc} accent={accent} svgRef={svgRef} />}
          </div>
        )}
    </div>
  );
}

// ── Process ─────────────────────────────────────────────────────────────────

function FlowView({ doc, accent, svgRef, yes, no }: {
  doc: SketchDoc;
  accent: string;
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  yes: string;
  no: string;
}): JSX.Element {
  const steps = doc.steps ?? [];
  // Every branch adds a row of two exits under its diamond, so the height has
  // to be summed rather than multiplied by the step count.
  const rowH = steps.map((s) => (s.branch ? BOX_H + 52 : BOX_H));
  const height = rowH.reduce((h, r) => h + r + GAP, 0) + PAD * 2;
  const width = BOX_W + PAD * 2;

  let y = PAD;
  const rows = steps.map((step, i) => {
    const top = y;
    y += (rowH[i] ?? BOX_H) + GAP;
    return { step, top, isLast: i === steps.length - 1 };
  });

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={doc.title}>
      <defs>
        <marker id="melete-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 z" fill={accent} />
        </marker>
      </defs>
      {rows.map(({ step, top, isLast }) => {
        const lines = wrapLabel(step.label, 34, 2);
        return (
          <g key={step.id}>
            {step.branch ? (
              <>
                <path
                  d={`M ${PAD + BOX_W / 2} ${top} L ${PAD + BOX_W} ${top + BOX_H / 2} L ${PAD + BOX_W / 2} ${top + BOX_H} L ${PAD} ${top + BOX_H / 2} Z`}
                  fill="var(--bg-panel, #17151f)"
                  stroke={accent}
                  strokeWidth={1.6}
                />
                <BoxText lines={lines} cx={PAD + BOX_W / 2} cy={top + BOX_H / 2} />
                <ExitPill x={PAD + 8} y={top + BOX_H + 14} label={`${yes} → ${step.branch.yes}`} color={accent} />
                <ExitPill x={PAD + 8} y={top + BOX_H + 38} label={`${no} → ${step.branch.no}`} color={T.muted} />
              </>
            ) : (
              <>
                <rect x={PAD} y={top} width={BOX_W} height={BOX_H} rx={12} fill="var(--bg-panel, #17151f)" stroke={accent} strokeWidth={1.6} />
                <BoxText lines={lines} cx={PAD + BOX_W / 2} cy={top + BOX_H / 2} />
                {step.note && (
                  <text x={PAD + BOX_W / 2} y={top + BOX_H - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted, #9490a6)" fontFamily="Inter, system-ui, sans-serif">
                    {wrapLabel(step.note, 44, 1)[0] ?? ''}
                  </text>
                )}
              </>
            )}
            {!isLast && (
              <line
                x1={PAD + BOX_W / 2}
                y1={top + (step.branch ? BOX_H + 52 : BOX_H)}
                x2={PAD + BOX_W / 2}
                y2={top + (step.branch ? BOX_H + 52 : BOX_H) + GAP - 8}
                stroke={accent}
                strokeWidth={1.6}
                markerEnd="url(#melete-arrow)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function BoxText({ lines, cx, cy }: { lines: string[]; cx: number; cy: number }): JSX.Element {
  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={cy - ((lines.length - 1) * 15) / 2 + i * 15 + 4}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill="var(--text-primary, #ece9f5)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {line}
        </text>
      ))}
    </>
  );
}

function ExitPill({ x, y, label, color }: { x: number; y: number; label: string; color: string }): JSX.Element {
  const text = wrapLabel(label, 40, 1)[0] ?? '';
  const w = Math.max(80, estimateWidth(text, 11) + 20);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={20} rx={10} fill="none" stroke={color} strokeWidth={1.2} />
      <text x={w / 2} y={14} textAnchor="middle" fontSize={11} fill={color} fontFamily="Inter, system-ui, sans-serif">{text}</text>
    </g>
  );
}

// ── Chronology ──────────────────────────────────────────────────────────────

function TimelineView({ doc, accent, svgRef }: {
  doc: SketchDoc;
  accent: string;
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
}): JSX.Element {
  const events = doc.events ?? [];
  const ROW = 74;
  const height = events.length * ROW + PAD * 2;
  const width = 620;
  const axis = 128;

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={doc.title}>
      <line x1={axis} y1={PAD} x2={axis} y2={height - PAD} stroke={accent} strokeWidth={2} strokeOpacity={0.5} />
      {events.map((e, i) => {
        const y = PAD + i * ROW + 18;
        return (
          <g key={e.id}>
            <circle cx={axis} cy={y} r={7} fill={accent} />
            <text x={axis - 18} y={y + 4} textAnchor="end" fontSize={13} fontWeight={700} fill={accent} fontFamily="ui-monospace, Consolas, monospace">
              {e.when}
            </text>
            <text x={axis + 20} y={y + 4} fontSize={14} fontWeight={600} fill="var(--text-primary, #ece9f5)" fontFamily="Inter, system-ui, sans-serif">
              {wrapLabel(e.label, 46, 1)[0] ?? ''}
            </text>
            {e.note && (
              <text x={axis + 20} y={y + 24} fontSize={12} fill="var(--text-muted, #9490a6)" fontFamily="Inter, system-ui, sans-serif">
                {wrapLabel(e.note, 56, 1)[0] ?? ''}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Comparison ──────────────────────────────────────────────────────────────

function CompareTableView({ doc, accent }: { doc: SketchDoc; accent: string }): JSX.Element {
  const table = doc.table;
  if (!table) return <></>;
  return (
    <div style={{ ...paper, padding: 0, overflow: 'auto', maxHeight: '62vh' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ ...cellStyle, ...headStyle, textAlign: 'left', width: '22%' }} />
            {table.items.map((item) => (
              <th key={item} style={{ ...cellStyle, ...headStyle, color: accent }}>{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" style={{ ...cellStyle, textAlign: 'left', fontWeight: 600, color: T.muted }}>{row.label}</th>
              {row.cells.map((cell, i) => (
                <td key={i} style={cellStyle}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellStyle: CSSProperties = {
  border: `1px solid ${T.border}`,
  padding: '10px 12px',
  verticalAlign: 'top',
  lineHeight: 1.5,
  textAlign: 'left',
};

const headStyle: CSSProperties = {
  background: 'var(--bg-void, #0e0d13)',
  fontWeight: 700,
  textAlign: 'center',
};
