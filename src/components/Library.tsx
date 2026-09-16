/**
 * Library.tsx — the binders.
 *
 * Since v2 a course is a set of documents, so this screen no longer imports
 * anything: it creates and opens BINDERS, and the documents go in from inside
 * (CourseDocs). That is the whole of the "sous-dossiers" request — a course is
 * the folder, and it was the data model that was wrong, not the screen.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { T, chip, ghostButton, h1, h2, input, lede, meta, panel, primaryButton, subjectColor } from '../styles';
import { courseChars, coursePassages, planIsValidated, type Course, type MeleteState } from '../lib/types';

interface Props {
  state: MeleteState;
  onCreate: (title: string, subject: string) => void;
  onOpen: (course: Course) => void;
  onRemove: (course: Course) => void;
}

export function Library(p: Props): JSX.Element {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');

  const create = (): void => {
    if (!title.trim()) return;
    p.onCreate(title, subject);
    setTitle('');
    setSubject('');
    setCreating(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={h1}>{t('library.title')}</h1>
        <p style={lede}>{t('app.subtitle')}</p>
      </div>

      <section style={{ ...panel, gap: '12px' }}>
        {creating ? (
          <>
            <input style={input} placeholder={t('library.titleLabel')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <input style={input} placeholder={t('library.subjectPlaceholder')} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={primaryButton} disabled={!title.trim()} onClick={create}>{t('library.add')}</button>
              <button style={ghostButton} onClick={() => setCreating(false)}>{t('library.cancel')}</button>
            </div>
          </>
        ) : (
          <button style={{ ...primaryButton, alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>
            📚 {t('library.newCourse')}
          </button>
        )}
      </section>

      {p.state.courses.length === 0 ? (
        <section style={{ ...panel, alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '38px', lineHeight: 1 }}>🪶</span>
          <h2 style={h2}>{t('library.emptyTitle')}</h2>
          <p style={lede}>{t('library.emptyBody')}</p>
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {p.state.courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              state={p.state}
              onOpen={() => p.onOpen(course)}
              onRemove={() => p.onRemove(course)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, state, onOpen, onRemove }: {
  course: Course; state: MeleteState; onOpen: () => void; onRemove: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const accent = subjectColor(course.subject);
  const cards = state.cards.filter((c) => c.courseId === course.id).length;
  const maps = state.maps.filter((m) => m.courseId === course.id).length;
  const sketches = state.sketches.filter((s) => s.courseId === course.id).length;
  const quizzes = state.quizzes.filter((q) => q.courseId === course.id).length;
  const passages = coursePassages(course);

  return (
    <article style={{ ...panel, gap: '10px', borderTop: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <strong style={{ fontSize: '15px', lineHeight: 1.35, flex: 1 }}>{course.title || t('library.untitled')}</strong>
        <button style={{ ...ghostButton, padding: '4px 8px', fontSize: '12px' }} onClick={onRemove} aria-label={t('library.delete')}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {course.subject && <span style={{ ...chip, color: accent, borderColor: accent }}>{course.subject}</span>}
        {course.level && <span style={chip}>{course.level}</span>}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <span style={meta}>
          {course.docs.length === 1
            ? t('library.docCountOne')
            : t('library.docCount', { n: course.docs.length })}
        </span>
        <span style={meta}>·</span>
        <span style={meta}>{t('library.chars', { n: courseChars(course).toLocaleString() })}</span>
        <span style={meta}>·</span>
        <span style={meta}>{passages === null ? t('library.passagesUnknown') : t('library.passages', { n: passages })}</span>
      </div>

      {/* A plan that exists but was never validated is neither absent nor
          agreed, and the card says which — it is the next thing to do. */}
      <span style={{ ...chip, alignSelf: 'flex-start', color: planIsValidated(course) ? T.good : T.warn, borderColor: planIsValidated(course) ? T.good : T.warn }}>
        {planIsValidated(course) ? t('library.planValidated') : course.plan ? t('library.planProposed') : t('library.planNone')}
      </span>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '2px' }}>
        <ArtifactDot on={maps > 0} icon="🧠" />
        <ArtifactDot on={sketches > 0} icon="✏️" />
        <ArtifactDot on={cards > 0} icon="🃏" label={cards > 0 ? String(cards) : undefined} />
        <ArtifactDot on={quizzes > 0} icon="🎯" />
        <div style={{ flex: 1 }} />
        <button style={{ ...primaryButton, padding: '6px 12px' }} onClick={onOpen}>{t('library.open')}</button>
      </div>
    </article>
  );
}

/** Present or absent, and nothing in between. A greyed icon says "not made
 *  yet"; a coloured one says "made". Neither ever shows a count of zero. */
function ArtifactDot({ on, icon, label }: { on: boolean; icon: string; label?: string | undefined }): JSX.Element {
  return (
    <span style={{
      fontSize: '15px', display: 'inline-flex', alignItems: 'center', gap: '4px',
      border: '1px solid', borderRadius: '8px', padding: '2px 6px', lineHeight: 1.2,
      color: on ? T.text : T.border, borderColor: on ? T.border : 'transparent',
    }}
    >
      {icon}{on && label ? <span style={{ ...meta, color: T.text }}>{label}</span> : null}
    </span>
  );
}
