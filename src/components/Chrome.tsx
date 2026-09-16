/**
 * Chrome.tsx — the header and the rail.
 *
 * The header carries the three numbers a student should see without asking:
 * level, XP toward the next one, and the streak. All three are derived on
 * render (see progress.ts) — the header is a view of the data, never a cache
 * of it.
 */
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { levelFromXp, streakFrom } from '../lib/progress';
import { T, meta } from '../styles';
import type { MeleteState } from '../lib/types';

export type ViewId = 'library' | 'review' | 'quiz' | 'progress';

export function Header({ state, now, dueCount }: { state: MeleteState; now: Date; dueCount: number }): JSX.Element {
  const { t } = useI18n();
  const level = levelFromXp(state.progress.xp);
  const streak = streakFrom(state.progress.days, now);

  return (
    <header style={headerStyle}>
      <span style={{ fontSize: '20px', lineHeight: 1 }}>🪶</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <strong style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>{t('app.name')}</strong>
        <span style={{ ...meta, fontSize: '11px' }}>{t('app.tagline')}</span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={levelPill}>{t('progress.level', { n: level.level })}</span>
        <div style={{ width: '110px', height: '6px', background: T.border, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((level.into / level.span) * 100)}%`, height: '100%', background: T.accent, transition: 'width 320ms ease' }} />
        </div>
        <span style={meta}>{state.progress.xp} XP</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}>
        <span style={{ fontSize: '15px', filter: streak > 0 ? 'none' : 'grayscale(1)' }}>🔥</span>
        {/* A streak of zero prints a dash, not a 0: nobody has a zero-day
            streak, they simply do not have one yet. */}
        <span style={{ ...meta, color: streak > 0 ? T.text : T.muted }}>{streak > 0 ? streak : '—'}</span>
      </div>

      {dueCount > 0 && <span style={{ ...duePill }}>{dueCount}</span>}
    </header>
  );
}

export function Rail({ view, onView, dueCount }: {
  view: ViewId;
  onView: (v: ViewId) => void;
  dueCount: number;
}): JSX.Element {
  const { t } = useI18n();
  const items: { id: ViewId; icon: string; key: string; badge?: number }[] = [
    { id: 'library', icon: '📚', key: 'nav.library' },
    { id: 'review', icon: '🃏', key: 'nav.review', ...(dueCount > 0 ? { badge: dueCount } : {}) },
    { id: 'quiz', icon: '🎯', key: 'nav.quiz' },
    { id: 'progress', icon: '📈', key: 'nav.progress' },
  ];

  return (
    <nav style={railStyle}>
      {items.map((item) => {
        const on = view === item.id;
        return (
          <button
            key={item.id}
            style={{ ...railButton, background: on ? T.raised : 'transparent', color: on ? T.text : T.muted, borderColor: on ? T.border : 'transparent' }}
            onClick={() => onView(item.id)}
            aria-current={on}
          >
            <span style={{ fontSize: '17px', lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{t(item.key)}</span>
            {item.badge !== undefined && <span style={railBadge}>{item.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 18px',
  borderBottom: `1px solid ${T.border}`,
  background: T.surface,
};

const levelPill: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: T.accent,
  border: `1px solid ${T.accent}`,
  borderRadius: '999px',
  padding: '2px 9px',
};

const duePill: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#12101a',
  background: T.good,
  borderRadius: '999px',
  padding: '2px 8px',
  marginLeft: '8px',
};

const railStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '14px 10px',
  borderRight: `1px solid ${T.border}`,
  background: T.surface,
  width: '84px',
};

const railButton: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '5px',
  padding: '10px 4px',
  border: '1px solid',
  borderRadius: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 140ms ease',
};

const railBadge: CSSProperties = {
  position: 'absolute',
  top: '4px',
  right: '6px',
  fontSize: '10px',
  fontWeight: 700,
  color: '#12101a',
  background: T.good,
  borderRadius: '999px',
  padding: '1px 5px',
};
