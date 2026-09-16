/**
 * Ask.tsx — putting a question to the course.
 *
 * The passages that produced the answer are shown UNDER it, always, not behind
 * a disclosure. They are the difference between "the app told me" and "my
 * course says, here". A student revising for an exam has to be able to check.
 *
 * 🎭 Three outcomes, and the middle one IS the feature: an answer with its
 * passages, "your course does not talk about this in these words" when the
 * search found nothing, and a plain failure when no model answered. Collapsing
 * the middle into either of the others is how an app starts answering from
 * general knowledge in a student's own course.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { askCourse, type Passage } from '../lib/ask';
import { T, errorBox, h2, input, lede, meta, noticeBox, panel, primaryButton, small } from '../styles';
import type { Course, Scope } from '../lib/types';

interface Exchange {
  question: string;
  answer: string;
  passages: Passage[];
}

export function Ask({ course, scope }: { course: Course; scope: Scope }): JSX.Element {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [failure, setFailure] = useState<'NOTHING_FOUND' | 'NO_TEXT' | 'MODEL_FAILED' | null>(null);

  const ask = async (): Promise<void> => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await askCourse(course, scope, q);
      if (!res.ok) { setFailure(res.code); return; }
      setHistory((h) => [{ question: q, answer: res.answer, passages: res.passages }, ...h]);
      setQuestion('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <section style={{ ...panel, gap: '10px' }}>
        <h2 style={h2}>{t('ask.title')}</h2>
        <p style={lede}>{t('ask.body')}</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            style={{ ...input, flex: 1, minWidth: '220px' }}
            value={question}
            placeholder={t('ask.placeholder')}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }}
          />
          <button style={primaryButton} disabled={busy || !question.trim()} onClick={() => void ask()}>
            {busy ? `⏳ ${t('gen.working')}` : t('ask.send')}
          </button>
        </div>

        {failure === 'NOTHING_FOUND' && (
          <div style={noticeBox}>
            <strong>{t('ask.nothingFound')}</strong>
            <p style={{ margin: '6px 0 0' }}>{t('ask.nothingFoundBody')}</p>
          </div>
        )}
        {failure === 'NO_TEXT' && <div style={errorBox}>{t('gen.noTextBody')}</div>}
        {failure === 'MODEL_FAILED' && (
          <div style={errorBox}>
            <strong>{t('gen.noModel')}</strong>
            <p style={{ margin: '6px 0 0' }}>{t('gen.noModelBody')}</p>
          </div>
        )}
      </section>

      {history.map((x, i) => (
        <section key={i} style={{ ...panel, gap: '10px' }}>
          <strong style={{ fontSize: '15px' }}>{x.question}</strong>
          <p style={{ fontSize: '14px', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{x.answer}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={meta}>{t('ask.fromCourse', { n: x.passages.length })}</span>
            {x.passages.map((p, j) => (
              <blockquote key={j} style={quoteStyle}>
                <span style={{ ...meta, marginRight: '6px' }}>[{j + 1}]</span>
                {p.text.length > 400 ? `${p.text.slice(0, 400).trimEnd()}…` : p.text}
              </blockquote>
            ))}
          </div>
        </section>
      ))}

      {history.length === 0 && !failure && <p style={small}>{t('ask.hint')}</p>}
    </div>
  );
}

const quoteStyle = {
  margin: 0,
  padding: '8px 12px',
  borderLeft: `2px solid ${T.accent}`,
  background: 'var(--bg-void, #0e0d13)',
  borderRadius: '0 8px 8px 0',
  fontSize: '12px',
  lineHeight: 1.6,
  color: T.muted,
  fontStyle: 'italic' as const,
};
