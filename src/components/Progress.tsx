/**
 * Progress.tsx — what the student has actually done.
 *
 * Every figure on this screen is recomputed from the data on the way in. The
 * only stored numbers are XP (a running total that nothing else can derive)
 * and the list of days; the level, the streak, the mastery and the badges are
 * all derived HERE, against today.
 *
 * 🎭 A deck with no cards shows `—` for mastery, never `0 %`. Zero per cent is
 * a measurement of a deck that exists and has been failed; a dash is the
 * absence of a deck. Merging them tells a student they are failing something
 * they have not started.
 */
import { useI18n } from '../i18n/useI18n';
import { BADGES, levelFromXp, reviewedToday, streakFrom, xpForLevel } from '../lib/progress';
import { forecast, masteryPct } from '../lib/schedule';
import { STATE_BUDGET, byteLength } from '../lib/store';
import { formatBytes } from '../lib/text';
import { T, chip, h1, h2, meta, panel, small, subjectColor } from '../styles';
import type { MeleteState } from '../lib/types';

export function ProgressView({ state, now, onGoal }: {
  state: MeleteState;
  now: Date;
  onGoal: (n: number) => void;
}): JSX.Element {
  const { t } = useI18n();
  const level = levelFromXp(state.progress.xp);
  const streak = streakFrom(state.progress.days, now);
  const done = reviewedToday(state.progress, now);
  const bars = forecast(state.cards, now, 7);
  const peak = Math.max(1, ...bars.map((b) => b.count));
  const used = byteLength(state);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px' }}>
      <h1 style={h1}>{t('progress.title')}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={panel}>
          <span style={meta}>{t('progress.level', { n: level.level })}</span>
          <strong style={{ fontSize: '34px', lineHeight: 1 }}>{state.progress.xp}</strong>
          <span style={small}>{t('progress.xp', { n: state.progress.xp })}</span>
          <div style={{ height: '8px', background: T.border, borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((level.into / level.span) * 100)}%`, height: '100%', background: T.accent }} />
          </div>
          <span style={small}>
            {t('progress.toNext', { n: Math.max(0, xpForLevel(level.level + 1) - state.progress.xp), level: level.level + 1 })}
          </span>
        </div>

        <div style={panel}>
          <span style={meta}>🔥</span>
          <strong style={{ fontSize: '34px', lineHeight: 1 }}>{streak === 0 ? '—' : streak}</strong>
          <span style={small}>{streak === 0 ? t('progress.streakNone') : t('progress.streak', { n: streak })}</span>
          <span style={{ ...chip, alignSelf: 'flex-start', color: done > 0 ? T.good : T.muted, borderColor: done > 0 ? T.good : T.border }}>
            {done > 0 ? t('progress.streakToday') : t('progress.streakIdle')}
          </span>
        </div>

        <div style={panel}>
          <span style={meta}>{t('progress.goalLabel')}</span>
          <strong style={{ fontSize: '34px', lineHeight: 1 }}>{state.progress.dailyGoal}</strong>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={state.progress.dailyGoal}
            onChange={(e) => onGoal(Number(e.target.value))}
            style={{ accentColor: T.accent, width: '100%' }}
          />
          <span style={small}>{t('cards.goal', { done, goal: state.progress.dailyGoal })}</span>
        </div>
      </div>

      <section style={panel}>
        <h2 style={h2}>{t('progress.forecast')}</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '120px' }}>
          {bars.map((b, i) => (
            <div key={b.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%' }}>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${Math.round((b.count / peak) * 100)}%`,
                    minHeight: b.count > 0 ? '4px' : '0',
                    background: i === 0 ? T.accent : T.border,
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 240ms ease',
                  }}
                />
              </div>
              <span style={{ ...meta, fontSize: '11px' }}>{i === 0 ? t('progress.forecastToday') : b.day.slice(5)}</span>
              <span style={{ ...meta, fontSize: '11px', color: T.text }}>{b.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>{t('progress.badges')}</h2>
        {state.progress.badges.length === 0
          ? <p style={small}>{t('progress.badgesNone')}</p>
          : (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {BADGES.filter((b) => state.progress.badges.includes(b.id)).map((b) => (
                <div key={b.id} style={{ ...panel, padding: '12px 14px', alignItems: 'center', gap: '6px', minWidth: '120px' }}>
                  <span style={{ fontSize: '26px', lineHeight: 1 }}>{b.icon}</span>
                  <span style={{ ...small, textAlign: 'center', color: T.text }}>{t(`badge.${b.id}`)}</span>
                </div>
              ))}
            </div>
          )}
      </section>

      <section style={panel}>
        <h2 style={h2}>{t('progress.byCourse')}</h2>
        {state.courses.length === 0
          ? <p style={small}>{t('library.emptyTitle')}</p>
          : state.courses.map((course) => {
            const cards = state.cards.filter((c) => c.courseId === course.id);
            const mastery = masteryPct(cards);
            const reviews = cards.reduce((n, c) => n + c.reps, 0);
            const accent = subjectColor(course.subject);
            return (
              <div key={course.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <strong style={{ fontSize: '14px', color: accent }}>{course.title}</strong>
                  <span style={{ ...meta, marginLeft: 'auto' }}>
                    {mastery === null ? t('cards.masteryUnknown') : t('cards.mastery', { n: mastery })}
                  </span>
                  <span style={meta}>{t('progress.reviews', { n: reviews })}</span>
                </div>
                <div style={{ height: '6px', background: T.border, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${mastery ?? 0}%`, height: '100%', background: accent }} />
                </div>
              </div>
            );
          })}
      </section>

      <p style={meta}>{t('progress.storage', { used: formatBytes(used), cap: formatBytes(STATE_BUDGET) })}</p>
    </div>
  );
}
