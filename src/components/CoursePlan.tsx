/**
 * CoursePlan.tsx — the structure Melete proposes and the human corrects.
 *
 * 🚨 This screen is EDITABLE or it is worthless. A plan you can only confirm is
 * one more click, not a validation — and it is the single occasion where
 * somebody can fix a heading the OCR misread before every card and every quiz
 * is generated from it.
 *
 * 🎭 A section Melete could not locate in the text says so, here, next to the
 * section. Widening it silently to the whole document is how a student gets a
 * fiche on the wrong chapter and never learns why.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { locatedCount } from '../lib/plan';
import { T, button, ghostButton, h2, input, lede, meta, noticeBox, panel, primaryButton, small } from '../styles';
import type { Course, Depth, Intent, Plan, Section } from '../lib/types';

interface Props {
  course: Course;
  /** True while the model is proposing. */
  proposing: boolean;
  proposeError: string | null;
  onPropose: () => void;
  onSave: (patch: {
    title: string; subject: string; teacher: string; level: string; plan: Plan;
  }) => void;
  onValidate: (patch: {
    title: string; subject: string; teacher: string; level: string; plan: Plan;
  }) => void;
  onIntent: (intent: Intent) => void;
}

const DEPTHS: Depth[] = ['overview', 'course', 'detail'];

export function CoursePlan(p: Props): JSX.Element {
  const { t } = useI18n();
  const [title, setTitle] = useState(p.course.title);
  const [subject, setSubject] = useState(p.course.subject);
  const [teacher, setTeacher] = useState(p.course.teacher);
  const [level, setLevel] = useState(p.course.level);
  const [sections, setSections] = useState<Section[]>(p.course.plan?.sections ?? []);

  const intent = p.course.intent;
  const [goal, setGoal] = useState(intent?.goal ?? '');
  const [strong, setStrong] = useState(intent?.strong ?? '');
  const [weak, setWeak] = useState(intent?.weak ?? '');
  const [depth, setDepth] = useState<Depth>(intent?.depth ?? 'course');

  // A fresh proposal arriving from the model must reach the fields the human is
  // about to edit — without it the screen would keep showing the old plan and
  // the button would look broken.
  useEffect(() => {
    setTitle(p.course.title);
    setSubject(p.course.subject);
    setTeacher(p.course.teacher);
    setLevel(p.course.level);
    setSections(p.course.plan?.sections ?? []);
  }, [p.course.plan?.proposedAt, p.course.title, p.course.subject, p.course.teacher, p.course.level, p.course]);

  const plan = p.course.plan;
  const validated = plan?.validatedAt != null;
  const collect = (): { title: string; subject: string; teacher: string; level: string; plan: Plan } => ({
    title: title.trim(),
    subject: subject.trim(),
    teacher: teacher.trim(),
    level: level.trim(),
    plan: {
      proposedAt: plan?.proposedAt ?? new Date().toISOString(),
      validatedAt: plan?.validatedAt ?? null,
      sections,
    },
  });

  const editSection = (id: string, patch: Partial<Section>): void => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {!plan && (
        <section style={{ ...panel, alignItems: 'flex-start', gap: '10px' }}>
          <h2 style={h2}>{t('plan.empty')}</h2>
          <p style={lede}>{t('plan.emptyBody')}</p>
          <button
            style={p.proposing ? { ...primaryButton, opacity: 0.7 } : primaryButton}
            disabled={p.proposing || p.course.docs.length === 0}
            onClick={p.onPropose}
          >
            {p.proposing ? `⏳ ${t('gen.working')}` : `✨ ${t('plan.propose')}`}
          </button>
          {p.course.docs.length === 0 && <p style={small}>{t('plan.needDocs')}</p>}
          {p.proposeError && <div style={{ ...noticeBox, borderLeftColor: T.bad }}>{p.proposeError}</div>}
        </section>
      )}

      {plan && (
        <>
          <section style={{ ...panel, gap: '10px' }}>
            <h2 style={h2}>{t('plan.identity')}</h2>
            <Field label={t('plan.title')} value={title} onChange={setTitle} />
            <Field label={t('library.subjectLabel')} value={subject} onChange={setSubject} />
            <Field label={t('plan.teacher')} value={teacher} onChange={setTeacher} placeholder={t('plan.optional')} />
            <Field label={t('plan.level')} value={level} onChange={setLevel} placeholder={t('plan.optional')} />
          </section>

          <section style={{ ...panel, gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={h2}>{t('plan.sections')}</h2>
              <span style={meta}>
                {t('plan.locatedCount', { located: locatedCount(plan), total: plan.sections.length })}
              </span>
            </div>

            {sections.length === 0 && <p style={small}>{t('plan.noSections')}</p>}

            {sections.map((s, i) => {
              const doc = p.course.docs.find((d) => d.id === s.docId);
              return (
                <div key={s.id} style={rowStyle}>
                  <span style={{ ...meta, minWidth: '20px' }}>{i + 1}</span>
                  <input
                    style={{ ...input, flex: 1 }}
                    value={s.title}
                    onChange={(e) => editSection(s.id, { title: e.target.value })}
                    aria-label={t('plan.sectionTitle')}
                  />
                  <span style={{ ...meta, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc?.name ?? '—'}
                  </span>
                  {s.start === null && (
                    <span style={{ ...meta, color: T.warn }} title={t('plan.notLocatedHelp')}>{t('plan.notLocated')}</span>
                  )}
                  <button
                    style={{ ...ghostButton, padding: '4px 8px', fontSize: '12px' }}
                    onClick={() => setSections((prev) => prev.filter((x) => x.id !== s.id))}
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {plan.sections.some((s) => s.start === null) && (
              <div style={noticeBox}>{t('plan.notLocatedHelp')}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button style={primaryButton} onClick={() => p.onValidate(collect())}>
                {validated ? `✓ ${t('plan.revalidate')}` : `✓ ${t('plan.validate')}`}
              </button>
              <button style={button} onClick={() => p.onSave(collect())}>{t('plan.save')}</button>
              <button style={ghostButton} disabled={p.proposing} onClick={p.onPropose}>
                {p.proposing ? `⏳ ${t('gen.working')}` : t('plan.reproposeShort')}
              </button>
            </div>
            {!validated && <p style={small}>{t('plan.notValidatedYet')}</p>}
          </section>
        </>
      )}

      <section style={{ ...panel, gap: '10px' }}>
        <h2 style={h2}>{t('intent.title')}</h2>
        <p style={lede}>{t('intent.body')}</p>
        <Field label={t('intent.goal')} value={goal} onChange={setGoal} placeholder={t('intent.goalPlaceholder')} />
        <Field label={t('intent.strong')} value={strong} onChange={setStrong} placeholder={t('intent.strongPlaceholder')} />
        <Field label={t('intent.weak')} value={weak} onChange={setWeak} placeholder={t('intent.weakPlaceholder')} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {DEPTHS.map((d) => (
            <button
              key={d}
              style={{ ...button, borderColor: depth === d ? T.accent : T.border, color: depth === d ? T.text : T.muted }}
              onClick={() => setDepth(d)}
            >
              {t(`intent.depth.${d}`)}
            </button>
          ))}
        </div>
        <button
          style={button}
          onClick={() => p.onIntent({
            goal: goal.trim(), strong: strong.trim(), weak: weak.trim(), depth,
            answeredAt: new Date().toISOString(),
          })}
        >
          {t('intent.save')}
        </button>
        {/* An unanswered questionnaire is not a failure — it is simply
            unanswered, and generation still works without it. */}
        {!intent?.answeredAt && <p style={small}>{t('intent.optional')}</p>}
      </section>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={meta}>{label}</span>
      <input style={input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? ''} />
    </label>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
};
