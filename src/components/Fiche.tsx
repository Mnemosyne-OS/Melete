/**
 * Fiche.tsx — the revision sheet, drawn.
 *
 * SVG rather than HTML for two reasons that both matter: the composition is
 * fixed (so nothing reflows into a different sheet on a narrower window), and
 * `dialog.writeFile` accepts `.svg` — which makes this the one artifact the
 * cartridge can actually export today, without pretending to produce a PDF it
 * cannot write (doc 103 §7).
 *
 * All the arithmetic lives in lib/fiche.ts. This file only paints.
 */
import { useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { exportSvgToFolder } from '../lib/exportSvg';
import { arrowPath, layoutFiche } from '../lib/fiche';
import { T, ghostButton, meta, paper, small, subjectColor } from '../styles';
import type { FicheDoc } from '../lib/types';

export function Fiche({ doc, subject, subtitle }: {
  doc: FicheDoc; subject: string; subtitle: string;
}): JSX.Element {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [openQuote, setOpenQuote] = useState<string | null>(null);
  const accent = subjectColor(subject);
  const layout = layoutFiche(doc, subtitle);

  const doExport = async (): Promise<void> => {
    const svg = svgRef.current;
    if (!svg) return;
    const res = await exportSvgToFolder(svg, doc.title || 'fiche');
    setExported(res.ok ? res.path : res.code === 'CANCELLED' ? null : (res.detail ?? res.code));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={meta}>{t('fiche.sheet')}</span>
        <div style={{ flex: 1 }} />
        <button style={ghostButton} onClick={() => void doExport()}>{t('fiche.export')}</button>
      </div>
      {exported && <p style={{ ...meta, margin: 0 }}>{exported}</p>}

      <div style={{ ...paper, padding: '10px', overflow: 'auto', maxHeight: '72vh' }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          height={layout.height}
          role="img"
          aria-label={doc.title}
          fontFamily="Inter, system-ui, sans-serif"
        >
          <defs>
            <marker id="melete-fiche-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" fill={accent} />
            </marker>
          </defs>

          {/* ── title band ─────────────────────────────────────────────── */}
          <rect x={0} y={0} width={layout.width} height={92} fill={accent} opacity={0.14} />
          <rect x={0} y={0} width={6} height={92} fill={accent} />
          {layout.titleLines.map((line, i) => (
            <text key={i} x={40} y={38 + i * 28} fontSize={26} fontWeight={700} fill="var(--text-primary, #ece9f5)">
              {line}
            </text>
          ))}
          <text x={40} y={78} fontSize={13} fill="var(--text-muted, #9490a6)">{layout.subtitle}</text>

          {/* ── links, under the cards so an arrow never covers a word ─── */}
          {layout.arrows.map((a, i) => (
            <g key={i}>
              <path d={arrowPath(a)} fill="none" stroke={accent} strokeWidth={1.6} strokeOpacity={0.7} markerEnd="url(#melete-fiche-arrow)" />
              {a.label && (
                <text x={a.labelX} y={a.labelY - 6} textAnchor="middle" fontSize={11} fill={accent}>{a.label}</text>
              )}
            </g>
          ))}

          {/* ── concept cards ──────────────────────────────────────────── */}
          {layout.boxes.map((b, i) => (
            <g
              key={b.id}
              style={{ cursor: b.quote ? 'pointer' : 'default' }}
              onClick={() => setOpenQuote(b.quote ?? null)}
            >
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={14}
                fill="var(--bg-panel, #17151f)" stroke={accent} strokeWidth={1.5} />
              <rect x={b.x} y={b.y} width={b.w} height={4} rx={2} fill={accent} opacity={0.8} />
              <circle cx={b.x + b.w - 20} cy={b.y + 22} r={12} fill={accent} opacity={0.18} />
              <text x={b.x + b.w - 20} y={b.y + 26} textAnchor="middle" fontSize={11} fontWeight={700} fill={accent}>
                {i + 1}
              </text>
              {b.titleLines.map((line, j) => (
                <text key={j} x={b.x + 16} y={b.y + 34 + j * 24} fontSize={17} fontWeight={700} fill="var(--text-primary, #ece9f5)">
                  {line}
                </text>
              ))}
              {b.bodyLines.map((line, j) => (
                <text
                  key={j}
                  x={b.x + 16}
                  y={b.y + 34 + b.titleLines.length * 24 + 4 + j * 19}
                  fontSize={13}
                  fill="var(--text-muted, #9490a6)"
                >
                  {line}
                </text>
              ))}
            </g>
          ))}

          {/* ── definitions, only when the course had vocabulary ────────── */}
          {layout.gloss && (
            <g>
              <text x={40} y={layout.gloss.y + 18} fontSize={12} fontWeight={700} letterSpacing="0.1em" fill={accent}>
                {t('digest.glossary').toUpperCase()}
              </text>
              {layout.gloss.rows.map((row) => (
                <g key={row.term}>
                  <text x={40} y={row.y + 14} fontSize={13} fontWeight={700} fill="var(--text-primary, #ece9f5)">{row.term}</text>
                  {row.defLines.map((line, j) => (
                    <text key={j} x={270} y={row.y + 14 + j * 19} fontSize={13} fill="var(--text-muted, #9490a6)">{line}</text>
                  ))}
                </g>
              ))}
            </g>
          )}

          {/* ── what to remember ───────────────────────────────────────── */}
          {layout.remember && ((remember) => (
            <g>
              <rect x={40} y={remember.y} width={layout.width - 80} height={remember.h}
                rx={12} fill={accent} opacity={0.12} />
              <text x={60} y={remember.y + 26} fontSize={12} fontWeight={700} letterSpacing="0.1em" fill={accent}>
                {t('fiche.remember').toUpperCase()}
              </text>
              {remember.lines.map((line, i) => (
                <text key={i} x={60} y={remember.y + 50 + i * 22} fontSize={15} fill="var(--text-primary, #ece9f5)">
                  {line}
                </text>
              ))}
            </g>
          ))(layout.remember)}
        </svg>
      </div>

      {/* A card carries the excerpt it was drawn from; clicking shows it. The
          sheet stays clean, and the claim stays checkable. */}
      {openQuote && (
        <blockquote style={{
          margin: 0, padding: '10px 14px', borderLeft: `2px solid ${T.accent}`,
          background: 'var(--bg-void, #0e0d13)', borderRadius: '0 8px 8px 0',
          fontSize: '13px', lineHeight: 1.6, color: T.muted, fontStyle: 'italic',
        }}
        >
          <span style={{ ...meta, display: 'block', marginBottom: '4px', fontStyle: 'normal' }}>{t('map.sourceQuote')}</span>
          {openQuote}
        </blockquote>
      )}
      <p style={small}>{t('fiche.clickHint')}</p>
    </div>
  );
}
