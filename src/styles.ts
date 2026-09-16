/**
 * styles.ts — the whole look, on the host's own tokens.
 *
 * Colors come from `var(--…)` because the host pushes its live palette into
 * the frame (`onHostConfig`), so a cartridge that hardcodes hex drifts the
 * moment the user changes their accent. Every fallback after a comma is what
 * the cartridge looks like in the half-second before that arrives, and when it
 * is opened standalone during development.
 *
 * Spacing is the 8pt grid; sizes come from the type scale (12 · 14 · 17 · 21 ·
 * 27 · 34) and nowhere else.
 *
 * 🚨 No `opacity` on text, ever. It composites the text against whatever is
 * behind it, which in a themed shell is not the color anyone checked for
 * contrast. Muted text uses a muted TOKEN.
 */
import type { CSSProperties } from 'react';

export const SANS = 'var(--font-sans, "Inter", system-ui, -apple-system, "Segoe UI", sans-serif)';
export const SERIF = 'Georgia, "Iowan Old Style", serif';
export const MONO = 'ui-monospace, "Cascadia Code", Consolas, monospace';

export const T = {
  text: 'var(--text-primary, #ece9f5)',
  muted: 'var(--text-muted, #9490a6)',
  accent: 'var(--accent, #7c6bf5)',
  surface: 'var(--bg-panel, #17151f)',
  raised: 'var(--bg-surface, #1e1b28)',
  base: 'var(--bg-void, #0e0d13)',
  border: 'var(--border-subtle, #2a2735)',
  good: 'var(--accent-green, #3fbf87)',
  bad: 'var(--accent-red, #e0616f)',
  warn: 'var(--accent-amber, #e0a54a)',
} as const;

/**
 * A stable hue for a subject name.
 *
 * The colour is DERIVED, never stored: two courses in the same subject get the
 * same branch colour on their maps without the student having to pick one, and
 * renaming a subject moves its colour with it. A stored colour would drift
 * apart from the name the day someone fixes a typo.
 */
export function subjectHue(subject: string): number {
  const s = subject.trim().toLowerCase();
  if (!s) return 258; // the shell's own violet, for a course with no subject yet
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export const subjectColor = (subject: string, l = 62): string =>
  `hsl(${subjectHue(subject)} 62% ${l}%)`;

// ── Layout ──────────────────────────────────────────────────────────────────

export const shell: CSSProperties = {
  fontFamily: SANS,
  color: T.text,
  background: T.base,
  height: '100vh',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  overflow: 'hidden',
};

export const body: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  minHeight: 0,
};

export const main: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  padding: '24px 28px 40px',
};

export const panel: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '14px',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

// ── Type ────────────────────────────────────────────────────────────────────

export const h1: CSSProperties = { fontSize: '27px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' };
export const h2: CSSProperties = { fontSize: '21px', fontWeight: 600, margin: 0 };
export const h3: CSSProperties = { fontSize: '17px', fontWeight: 600, margin: 0 };
export const lede: CSSProperties = { fontSize: '14px', lineHeight: 1.6, color: T.muted, margin: 0, maxWidth: '62ch' };
export const small: CSSProperties = { fontSize: '12px', color: T.muted, margin: 0 };
export const meta: CSSProperties = { fontFamily: MONO, fontSize: '12px', color: T.muted, letterSpacing: '0.02em' };

// ── Controls ────────────────────────────────────────────────────────────────

export const button: CSSProperties = {
  fontFamily: SANS,
  fontSize: '14px',
  fontWeight: 500,
  color: T.text,
  background: T.raised,
  border: `1px solid ${T.border}`,
  borderRadius: '10px',
  padding: '9px 14px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  transition: 'transform 120ms ease, background 120ms ease, border-color 120ms ease',
};

export const primaryButton: CSSProperties = {
  ...button,
  background: T.accent,
  borderColor: 'transparent',
  color: '#fff',
  fontWeight: 600,
};

export const ghostButton: CSSProperties = {
  ...button,
  background: 'transparent',
};

export const input: CSSProperties = {
  fontFamily: SANS,
  fontSize: '14px',
  color: T.text,
  background: T.base,
  border: `1px solid ${T.border}`,
  borderRadius: '10px',
  padding: '10px 12px',
  width: '100%',
  outline: 'none',
};

export const chip: CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  borderRadius: '999px',
  padding: '3px 10px',
  border: `1px solid ${T.border}`,
  color: T.muted,
  whiteSpace: 'nowrap',
};

// ── Surfaces with meaning ───────────────────────────────────────────────────

/** The paper a map or a schema is drawn on. Warmer than the app so the drawing
 *  reads as an artefact you made, not another panel of the interface. */
export const paper: CSSProperties = {
  background:
    'radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--accent, #7c6bf5) 7%, transparent), transparent 55%), var(--bg-surface, #1e1b28)',
  border: `1px solid ${T.border}`,
  borderRadius: '14px',
  position: 'relative',
  overflow: 'hidden',
};

/** A block that names a limitation rather than a failure. */
export const noticeBox: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderLeft: `3px solid ${T.warn}`,
  borderRadius: '10px',
  padding: '12px 14px',
  background: T.raised,
  fontSize: '13px',
  lineHeight: 1.6,
  color: T.text,
};

/** A block that names a failure, with the next step in it. */
export const errorBox: CSSProperties = {
  ...noticeBox,
  borderLeftColor: T.bad,
};
