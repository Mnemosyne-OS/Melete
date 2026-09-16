/**
 * Review.tsx — the flashcard session.
 *
 * The session queue is built ONCE, at mount, from the cards that were due when
 * the student sat down. It deliberately does not follow the store: answering a
 * card changes its due date, and a queue derived from "what is due now" would
 * shrink under the student's hands mid-session — or, for a card pushed back to
 * box 1, never end.
 *
 * A missed card is pushed to the BACK of this session instead of vanishing
 * until tomorrow. Re-seeing it three cards later is where the re-learning
 * happens, and it is also the only honest reading of "not yet".
 */
import { useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { XP } from '../lib/progress';
import { T, button, ghostButton, h2, lede, meta, panel, primaryButton, small, subjectColor } from '../styles';
import type { Card, Course } from '../lib/types';

interface Props {
  due: Card[];
  courses: Course[];
  goal: number;
  doneToday: number;
  onAnswer: (card: Card, correct: boolean) => void;
  onLeave: () => void;
}

export function Review({ due, courses, goal, doneToday, onAnswer, onLeave }: Props): JSX.Element {
  const { t } = useI18n();
  // A lazy useState initializer, not a memo of `due`: this is a SNAPSHOT of
  // the sitting taken once at mount (see the module note), and useState is the
  // hook that means that. A memo keyed on `due` would rebuild the queue every
  // time an answer changed the store.
  const [initial] = useState<Card[]>(() => due);
  const [queue, setQueue] = useState<Card[]>(initial);
  const [flipped, setFlipped] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [xp, setXp] = useState(0);
  const answered = useRef(0);

  const card = queue[0] ?? null;
  const course = card ? courses.find((c) => c.id === card.courseId) ?? null : null;
  const accent = subjectColor(course?.subject ?? '');

  if (initial.length === 0) {
    return (
      <div style={{ ...panel, alignItems: 'flex-start' }}>
        <h2 style={h2}>{t('cards.none')}</h2>
        <p style={lede}>{t('cards.noneBody')}</p>
        <button style={button} onClick={onLeave}>{t('cards.backToCourses')}</button>
      </div>
    );
  }

  if (!card) {
    return (
      <div style={{ ...panel, alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ fontSize: '44px', lineHeight: 1 }}>🌱</div>
        <h2 style={h2}>{t('cards.sessionDone')}</h2>
        <p style={lede}>{t('cards.sessionSummary', { correct, total: answered.current, xp })}</p>
        <button style={primaryButton} onClick={onLeave}>{t('cards.backToCourses')}</button>
      </div>
    );
  }

  const answer = (isCorrect: boolean): void => {
    answered.current += 1;
    if (isCorrect) setCorrect((n) => n + 1);
    setXp((n) => n + XP.reviewCard);
    onAnswer(card, isCorrect);
    setFlipped(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      // A missed card comes back at the end of THIS sitting; a known one leaves.
      return isCorrect || !head ? rest : [...rest, head];
    });
  };

  const goalPct = goal > 0 ? Math.min(100, Math.round(((doneToday + answered.current) / goal) * 100)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={meta}>{t('cards.due', { n: queue.length })}</span>
        <div style={{ flex: 1, height: '6px', background: T.border, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${goalPct}%`, height: '100%', background: T.good, transition: 'width 260ms ease' }} />
        </div>
        <span style={meta}>{t('cards.goal', { done: doneToday + answered.current, goal })}</span>
      </div>

      <div style={{ ...cardStyle, borderColor: accent }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {course && <span style={{ ...meta, color: accent }}>{course.title}</span>}
          <div style={{ flex: 1 }} />
          <span style={meta}>{t('cards.box', { n: card.box })}</span>
        </div>

        <p style={{ fontSize: '21px', lineHeight: 1.45, margin: '18px 0 0', fontWeight: 600 }}>{card.front}</p>

        {flipped && (
          <div style={{ marginTop: '18px', borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
            <p style={{ fontSize: '16px', lineHeight: 1.6, margin: 0 }}>{card.back}</p>
            {card.quote && <blockquote style={quoteStyle}>{card.quote}</blockquote>}
          </div>
        )}
      </div>

      {flipped ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={{ ...button, borderColor: T.bad, color: T.bad, flex: 1, justifyContent: 'center' }} onClick={() => answer(false)}>
            {t('cards.missed')}
          </button>
          <button style={{ ...button, borderColor: T.good, color: T.good, flex: 1, justifyContent: 'center' }} onClick={() => answer(true)}>
            {t('cards.gotIt')}
          </button>
        </div>
      ) : (
        <button style={{ ...primaryButton, justifyContent: 'center' }} onClick={() => setFlipped(true)}>
          {t('cards.show')}
        </button>
      )}

      <button style={{ ...ghostButton, alignSelf: 'flex-start' }} onClick={onLeave}>{t('cards.backToCourses')}</button>
      <p style={small}>{t('cards.count', { n: initial.length })}</p>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: T.surface,
  border: '2px solid',
  borderRadius: '16px',
  padding: '22px 24px',
  minHeight: '220px',
  display: 'flex',
  flexDirection: 'column',
};

const quoteStyle: CSSProperties = {
  margin: '14px 0 0',
  padding: '8px 12px',
  borderLeft: `2px solid ${T.accent}`,
  background: 'var(--bg-void, #0e0d13)',
  borderRadius: '0 8px 8px 0',
  fontSize: '12px',
  lineHeight: 1.6,
  color: T.muted,
  fontStyle: 'italic',
};
