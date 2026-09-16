/**
 * QuizRunner.tsx — one attempt at a generated quiz.
 *
 * The answer is committed before it is graded, and the explanation only
 * appears after. That order is the whole point: a quiz that shows the reason
 * while the choice is still open is a reading exercise.
 *
 * 🎭 The end screen names the TOPICS missed, not a percentage. "62 %" tells a
 * student they are behind; "sources of law, hierarchy of norms" tells them what
 * to open. When nothing was missed it says so rather than showing an empty
 * heading, which reads as a feature that failed.
 */
import { useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { T, button, ghostButton, h2, meta, panel, primaryButton, small, subjectColor } from '../styles';
import type { Course, QuizAttempt, QuizDoc } from '../lib/types';

interface Props {
  quiz: QuizDoc;
  course: Course | null;
  onFinish: (attempt: Omit<QuizAttempt, 'at'>, correctCount: number) => void;
  onLeave: () => void;
}

export function QuizRunner({ quiz, course, onFinish, onLeave }: Props): JSX.Element {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const accent = subjectColor(course?.subject ?? '');

  const question = quiz.questions[index];
  const total = quiz.questions.length;

  if (done) {
    return (
      <div style={{ ...panel, alignItems: 'flex-start', gap: '14px', maxWidth: '720px' }}>
        <div style={{ fontSize: '40px', lineHeight: 1 }}>{correct === total ? '🏆' : '📎'}</div>
        <h2 style={h2}>{t('quiz.score', { correct, total })}</h2>
        <div style={{ width: '100%', height: '8px', background: T.border, borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((correct / Math.max(1, total)) * 100)}%`, height: '100%', background: accent }} />
        </div>
        <h3 style={{ ...meta, marginTop: '8px' }}>{t('quiz.reviseNext')}</h3>
        {missed.length === 0
          ? <p style={small}>{t('quiz.reviseNone')}</p>
          : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[...new Set(missed)].map((topic) => (
                <span key={topic} style={{ ...topicChip, borderColor: T.bad, color: T.bad }}>{topic}</span>
              ))}
            </div>
          )}
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button
            style={button}
            onClick={() => { setIndex(0); setPicked(null); setChecked(false); setCorrect(0); setMissed([]); setDone(false); }}
          >
            {t('quiz.retake')}
          </button>
          <button style={ghostButton} onClick={onLeave}>{t('cards.backToCourses')}</button>
        </div>
      </div>
    );
  }

  if (!question) {
    // An empty quiz cannot be generated (the parser refuses fewer than two
    // questions), so this is only reachable through a corrupted blob — say it
    // plainly rather than rendering a blank panel.
    return (
      <div style={{ ...panel, alignItems: 'flex-start' }}>
        <p style={small}>{t('quiz.empty')}</p>
        <button style={button} onClick={onLeave}>{t('cards.backToCourses')}</button>
      </div>
    );
  }

  const check = (): void => {
    if (picked === null) return;
    setChecked(true);
    if (picked === question.answer) setCorrect((n) => n + 1);
    else if (question.topic) setMissed((m) => [...m, question.topic ?? '']);
  };

  const next = (): void => {
    const last = index + 1 >= total;
    if (last) {
      const finalCorrect = correct;
      onFinish({ quizId: quiz.id, courseId: quiz.courseId, correct: finalCorrect, total, missed: [...new Set(missed)] }, finalCorrect);
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
    setChecked(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={meta}>{t('quiz.question', { n: index + 1, total })}</span>
        <div style={{ flex: 1, height: '5px', background: T.border, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((index / total) * 100)}%`, height: '100%', background: accent, transition: 'width 220ms ease' }} />
        </div>
      </div>

      <div style={{ ...panel, gap: '16px' }}>
        <p style={{ fontSize: '18px', lineHeight: 1.5, margin: 0, fontWeight: 600 }}>{question.prompt}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {question.choices.map((choice, i) => {
            const isPicked = picked === i;
            const isAnswer = i === question.answer;
            const border = checked && isAnswer ? T.good : checked && isPicked ? T.bad : isPicked ? accent : T.border;
            return (
              <button
                key={i}
                style={{ ...choiceStyle, borderColor: border, background: isPicked ? 'var(--bg-void, #0e0d13)' : T.raised }}
                onClick={() => { if (!checked) setPicked(i); }}
                aria-pressed={isPicked}
              >
                <span style={{ ...markStyle, borderColor: border, color: border }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1 }}>{choice}</span>
              </button>
            );
          })}
        </div>

        {checked && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <strong style={{ color: picked === question.answer ? T.good : T.bad, fontSize: '14px' }}>
              {picked === question.answer ? t('quiz.correct') : t('quiz.wrong')}
            </strong>
            {question.why && (
              <p style={{ fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                <span style={{ ...meta, marginRight: '8px' }}>{t('quiz.why')}</span>
                {question.why}
              </p>
            )}
            {question.quote && <blockquote style={quoteStyle}>{question.quote}</blockquote>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        {checked
          ? <button style={primaryButton} onClick={next}>{index + 1 >= total ? t('quiz.finish') : t('quiz.next')}</button>
          : <button style={{ ...primaryButton, opacity: picked === null ? 0.55 : 1 }} onClick={check} disabled={picked === null}>{t('quiz.check')}</button>}
        <button style={ghostButton} onClick={onLeave}>{t('cards.backToCourses')}</button>
      </div>
    </div>
  );
}

const choiceStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  textAlign: 'left',
  fontSize: '14px',
  lineHeight: 1.5,
  color: T.text,
  border: '1.5px solid',
  borderRadius: '12px',
  padding: '12px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color 140ms ease, background 140ms ease',
};

const markStyle: CSSProperties = {
  width: '24px',
  height: '24px',
  flexShrink: 0,
  borderRadius: '8px',
  border: '1.5px solid',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 700,
};

const topicChip: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  borderRadius: '999px',
  padding: '4px 12px',
  border: '1px solid',
};

const quoteStyle: CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderLeft: `2px solid ${T.accent}`,
  background: 'var(--bg-void, #0e0d13)',
  borderRadius: '0 8px 8px 0',
  fontSize: '12px',
  lineHeight: 1.6,
  color: T.muted,
  fontStyle: 'italic',
};
