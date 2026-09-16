/**
 * CourseView.tsx — one binder, and everything Melete can do with it.
 *
 * The layout was reworked after "l'interface est fouillis". Three things caused
 * the clutter and each is fixed here rather than restyled:
 *
 *  1. **The controls were a PANEL, repeated on every tab.** Scope, feedback and
 *     the generate button now live on one toolbar line. A box that appears on
 *     six screens is furniture; a line is a control.
 *  2. **Eight tabs in one undifferentiated row.** They are grouped now — what
 *     you set up, what you make, what you use — with a separator, so the row
 *     reads as three short lists instead of one long one.
 *  3. **Every block was a bordered card.** Borders are what the eye counts, so
 *     the count is down: one surface per idea, whitespace between them.
 *
 * The honesty rules are untouched: a binder with no validated plan can still
 * generate — refusing would be worse — but it generates from the top of the
 * whole thing and the screen says so.
 */
import { useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { Ask } from './Ask';
import { CourseDocs } from './CourseDocs';
import { CoursePlan } from './CoursePlan';
import { ExportBar } from './ExportBar';
import { Fiche } from './Fiche';
import { FicheEditor } from './FicheEditor';
import { MindMap } from './MindMap';
import { Sketch } from './Sketch';
import { cardsToMarkdown, ficheToMarkdown, mapToMarkdown, quizToMarkdown, sketchToMarkdown } from '../lib/exportArtifact';
import { masteryPct } from '../lib/schedule';
import { weakTopics } from '../lib/weak';
import {
  T, button, chip, errorBox, ghostButton, h1, h2, input, lede, meta, noticeBox, panel, primaryButton, small, subjectColor,
} from '../styles';
import type { GenFailure } from '../lib/generate';
import type { ImportError, ImportPhase } from '../lib/importCourse';
import type { WeakTopic } from '../lib/weak';
import type {
  ArtifactKind, Card, Course, Doc, FicheDoc, Intent, MeleteState, Plan, Provenance, Scope, SketchKind,
} from '../lib/types';
import { planIsValidated } from '../lib/types';

export interface GenState { kind: ArtifactKind; sketchKind?: SketchKind }

interface Props {
  course: Course;
  state: MeleteState;
  scope: Scope;
  onScope: (s: Scope) => void;
  busy: GenState | null;
  failure: { kind: ArtifactKind; sketchKind?: SketchKind; code: GenFailure; detail?: string } | null;
  phase: ImportPhase | null;
  importError: ImportError | null;
  notice: string | null;
  onImportFile: () => void;
  onImportPhoto: () => void;
  onPaste: (name: string, text: string) => void;
  onWeb: (url: string) => void;
  onRemoveDoc: (doc: Doc) => void;
  proposing: boolean;
  proposeError: string | null;
  onPropose: () => void;
  onSavePlan: (patch: { title: string; subject: string; teacher: string; level: string; plan: Plan }) => void;
  onValidatePlan: (patch: { title: string; subject: string; teacher: string; level: string; plan: Plan }) => void;
  onIntent: (intent: Intent) => void;
  onGenerate: (kind: ArtifactKind, feedback: string, sketchKind?: SketchKind) => void;
  onEditCard: (card: Card) => void;
  onEditFiche: (fiche: FicheDoc) => void;
  onDeleteCard: (card: Card) => void;
  onStartQuiz: (quizId: string) => void;
  onReview: (courseId: string) => void;
  onBack: () => void;
}

/** Three groups, in the order the work happens. The separator between them is
 *  the point: one row of eight is a wall, three short lists is a map. */
const TAB_GROUPS: { id: string; key: string }[][] = [
  [{ id: 'docs', key: 'tabs.docs' }, { id: 'plan', key: 'tabs.plan' }],
  [{ id: 'fiche', key: 'tabs.fiche' }, { id: 'map', key: 'tabs.map' }, { id: 'sketch', key: 'tabs.sketch' }],
  [{ id: 'cards', key: 'tabs.cards' }, { id: 'quiz', key: 'tabs.quiz' }, { id: 'ask', key: 'tabs.ask' }],
];

/** Artifacts of this course that match the scope currently selected. */
function inScope<T extends Provenance>(items: T[], courseId: string, scope: Scope): T[] {
  return items.filter((a) => a.courseId === courseId
    && (scope.k === 'course' ? a.scope.k === 'course' : a.scope.k === 'section' && a.scope.sectionId === scope.sectionId));
}

export function CourseView(p: Props): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<string>(p.course.docs.length === 0 ? 'docs' : 'fiche');
  const [sketchKind, setSketchKind] = useState<SketchKind>('flow');
  const [feedback, setFeedback] = useState('');
  const [editingFiche, setEditingFiche] = useState(false);
  const accent = subjectColor(p.course.subject);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const map = inScope(p.state.maps, p.course.id, p.scope).slice(-1)[0] ?? null;
  const sketch = inScope(p.state.sketches, p.course.id, p.scope).filter((s) => s.kind === sketchKind).slice(-1)[0] ?? null;
  const quiz = inScope(p.state.quizzes, p.course.id, p.scope).slice(-1)[0] ?? null;
  const fiche = inScope(p.state.fiches, p.course.id, p.scope).slice(-1)[0] ?? null;
  const digest = inScope(p.state.digests, p.course.id, p.scope).slice(-1)[0] ?? null;
  const cards = p.state.cards.filter((c) => c.courseId === p.course.id
    && (p.scope.k === 'course' || c.sectionId === p.scope.sectionId));
  const attempts = p.state.attempts.filter((a) => a.courseId === p.course.id).slice(-5).reverse();

  const activeScope = p.scope;
  const scopeName = activeScope.k === 'section'
    ? (p.course.plan?.sections.find((x) => x.id === activeScope.sectionId)?.title ?? '')
    : '';
  const sheetTitle = [p.course.title, scopeName].filter(Boolean).join(' - ');

  const running = (kind: ArtifactKind, sk?: SketchKind): boolean =>
    p.busy?.kind === kind && (sk === undefined || p.busy.sketchKind === sk);

  const firstSvg = (): SVGSVGElement | null => sheetRef.current?.querySelector('svg') ?? null;

  /** One line, not a panel: what part, what to fix, and the button. */
  const toolbar = (kind: ArtifactKind, sk?: SketchKind, has = false): JSX.Element => (
    <div style={toolbarStyle}>
      <select
        style={{ ...input, width: 'auto', minWidth: '160px', cursor: 'pointer', padding: '7px 10px' }}
        value={p.scope.k === 'course' ? '' : p.scope.sectionId}
        onChange={(e) => p.onScope(e.target.value ? { k: 'section', sectionId: e.target.value } : { k: 'course' })}
        aria-label={t('gen.scopeLabel')}
      >
        <option value="">{t('gen.scopeWhole')}</option>
        {(p.course.plan?.sections ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.start === null ? `${s.title} (${t('plan.notLocated')})` : s.title}
          </option>
        ))}
      </select>
      <input
        style={{ ...input, flex: 1, minWidth: '180px', padding: '7px 10px' }}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={t('gen.feedbackPlaceholder')}
        aria-label={t('gen.feedbackLabel')}
      />
      <button
        style={running(kind, sk) ? { ...primaryButton, opacity: 0.7 } : primaryButton}
        disabled={p.busy !== null}
        onClick={() => p.onGenerate(kind, feedback.trim(), sk)}
      >
        {running(kind, sk) ? `⏳ ${t('gen.working')}` : has ? t('gen.remake') : `✨ ${t('gen.make')}`}
      </button>
    </div>
  );

  const failureFor = (kind: ArtifactKind, sk?: SketchKind): JSX.Element | null => {
    const f = p.failure;
    if (!f || f.kind !== kind || (sk !== undefined && f.sketchKind !== sk)) return null;
    return <GenFailureBox code={f.code} detail={f.detail} sketchKind={sk} />;
  };

  const provenanceLine = (a: Provenance | null): JSX.Element | null => {
    if (!a) return null;
    const parts: string[] = [];
    if (a.complete === false) parts.push(t('gen.partial'));
    if (a.feedback) parts.push(t('gen.madeWithFeedback', { feedback: a.feedback }));
    return parts.length ? <p style={{ ...small, color: T.warn, margin: 0 }}>{parts.join(' ')}</p> : null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button style={{ ...ghostButton, padding: '5px 9px' }} onClick={p.onBack}>←</button>
        <h1 style={{ ...h1, fontSize: '20px' }}>{p.course.title || t('library.untitled')}</h1>
        {p.course.subject && <span style={{ ...chip, color: accent, borderColor: accent }}>{p.course.subject}</span>}
        {p.course.level && <span style={chip}>{p.course.level}</span>}
        {p.course.teacher && <span style={chip}>{p.course.teacher}</span>}
      </header>

      <nav style={navStyle}>
        {TAB_GROUPS.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            {gi > 0 && <span style={dividerStyle} aria-hidden />}
            {group.map((tb) => (
              <button
                key={tb.id}
                style={{
                  ...tabStyle,
                  color: tab === tb.id ? T.text : T.muted,
                  background: tab === tb.id ? T.raised : 'transparent',
                }}
                onClick={() => setTab(tb.id)}
                aria-current={tab === tb.id}
              >
                {t(tb.key)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {!planIsValidated(p.course) && tab !== 'docs' && tab !== 'plan' && (
        <p style={{ ...small, color: T.warn, margin: 0 }}>{t('plan.notValidatedNotice')}</p>
      )}

      {tab === 'docs' && (
        <CourseDocs
          course={p.course}
          phase={p.phase}
          error={p.importError}
          notice={p.notice}
          onImportFile={p.onImportFile}
          onImportPhoto={p.onImportPhoto}
          onPaste={p.onPaste}
          onWeb={p.onWeb}
          onRemoveDoc={p.onRemoveDoc}
        />
      )}

      {tab === 'plan' && (
        <CoursePlan
          course={p.course}
          proposing={p.proposing}
          proposeError={p.proposeError}
          onPropose={p.onPropose}
          onSave={p.onSavePlan}
          onValidate={p.onValidatePlan}
          onIntent={p.onIntent}
        />
      )}

      {tab === 'fiche' && (
        <div style={sectionStyle}>
          {toolbar('fiche', undefined, !!fiche)}
          {failureFor('fiche')}
          {provenanceLine(fiche)}
          {fiche && editingFiche && (
            <FicheEditor
              doc={fiche}
              onSave={(next) => { p.onEditFiche(next); setEditingFiche(false); }}
              onCancel={() => setEditingFiche(false)}
            />
          )}
          {fiche && !editingFiche
            ? (
              <div ref={sheetRef} style={sectionStyle}>
                <Fiche doc={fiche} subject={p.course.subject} subtitle={sheetTitle} />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button style={ghostButton} onClick={() => setEditingFiche(true)}>{t('ficheEdit.open')}</button>
                </div>
                <ExportBar markdown={ficheToMarkdown(fiche)} title={sheetTitle} svg={firstSvg} />
              </div>
            )
            : !fiche ? <Empty title={t('fiche.empty')} body={t('fiche.emptyBody')} /> : null}
          {digest && <OldDigest points={digest.keyPoints} gloss={digest.glossary} accent={accent} />}
        </div>
      )}

      {tab === 'map' && (
        <div style={sectionStyle}>
          {toolbar('map', undefined, !!map)}
          {failureFor('map')}
          {provenanceLine(map)}
          {map
            ? (
              <div ref={sheetRef} style={sectionStyle}>
                <MindMap doc={map} subject={p.course.subject} />
                <ExportBar markdown={mapToMarkdown(map)} title={map.title} svg={firstSvg} />
              </div>
            )
            : <Empty title={t('map.empty')} body={t('map.emptyBody')} />}
        </div>
      )}

      {tab === 'sketch' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['flow', 'compare', 'timeline'] as SketchKind[]).map((k) => (
              <button
                key={k}
                style={{ ...tabStyle, color: sketchKind === k ? T.text : T.muted, background: sketchKind === k ? T.raised : 'transparent' }}
                onClick={() => setSketchKind(k)}
              >
                {t(`sketch.kind${k === 'flow' ? 'Flow' : k === 'compare' ? 'Compare' : 'Timeline'}`)}
              </button>
            ))}
          </div>
          {toolbar('sketch', sketchKind, !!sketch)}
          {failureFor('sketch', sketchKind)}
          {provenanceLine(sketch)}
          {sketch
            ? (
              <div ref={sheetRef} style={sectionStyle}>
                <Sketch doc={sketch} subject={p.course.subject} />
                <ExportBar
                  markdown={sketchToMarkdown(sketch)}
                  title={sketch.title || sketchKind}
                  {...(sketch.kind === 'compare' ? {} : { svg: firstSvg })}
                />
              </div>
            )
            : <Empty title={t('sketch.empty')} body={t('sketch.emptyBody')} />}
        </div>
      )}

      {tab === 'cards' && (
        <div style={sectionStyle}>
          {toolbar('cards', undefined, cards.length > 0)}
          {failureFor('cards')}
          {cards.length === 0
            ? <Empty title={t('cards.empty')} body={t('cards.emptyBody')} />
            : (
              <>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={meta}>{t('cards.count', { n: cards.length })}</span>
                  <span style={meta}>
                    {masteryPct(cards) === null ? t('cards.masteryUnknown') : t('cards.mastery', { n: masteryPct(cards) ?? 0 })}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button style={button} onClick={() => p.onReview(p.course.id)}>🃏 {t('nav.review')}</button>
                </div>
                <ExportBar markdown={cardsToMarkdown(cards, sheetTitle)} title={sheetTitle} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {cards.map((c) => (
                    <EditableCard key={c.id} card={c} accent={accent} onSave={p.onEditCard} onDelete={p.onDeleteCard} />
                  ))}
                </div>
              </>
            )}
        </div>
      )}

      {tab === 'quiz' && (
        <div style={sectionStyle}>
          {toolbar('quiz', undefined, !!quiz)}
          {failureFor('quiz')}
          {provenanceLine(quiz)}
          {quiz
            ? (
              <>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={meta}>{t('quiz.questionCount', { n: quiz.questions.length })}</span>
                  <div style={{ flex: 1 }} />
                  <button style={primaryButton} onClick={() => p.onStartQuiz(quiz.id)}>▶ {t('quiz.start')}</button>
                </div>
                <ExportBar markdown={quizToMarkdown(quiz)} title={quiz.title || sheetTitle} />
                <WeakBlock
                  topics={weakTopics(p.state.attempts, p.course.id)}
                  accent={accent}
                  onWork={(topic) => setFeedback(t('gen.focusOn', { topic }))}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={meta}>{t('quiz.history')}</span>
                  {attempts.length === 0
                    ? <p style={small}>{t('quiz.noHistory')}</p>
                    : attempts.map((a) => (
                      <div key={a.at} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ ...meta, color: T.text }}>{t('quiz.score', { correct: a.correct, total: a.total })}</span>
                        <span style={meta}>{a.at.slice(0, 10)}</span>
                        <div style={{ flex: 1 }} />
                        {a.missed.slice(0, 3).map((topic) => (
                          <span key={topic} style={{ ...chip, color: T.bad, borderColor: T.bad }}>{topic}</span>
                        ))}
                      </div>
                    ))}
                </div>
              </>
            )
            : <Empty title={t('quiz.empty')} body={t('quiz.emptyBody')} />}
        </div>
      )}

      {tab === 'ask' && <Ask course={p.course} scope={p.scope} />}
    </div>
  );
}

/**
 * What the quiz results show, as opposed to what the student said.
 *
 * 🎭 It reports a MEASURE with its denominator ("missed 3 of 4 attempts"), not
 * a verdict. "You are weak on X" is a judgement the app has no standing to
 * make; "you missed X on three of four attempts" is a fact the student can
 * argue with, and arguing with it is how they decide what to do next.
 */
function WeakBlock({ topics, accent, onWork }: {
  topics: WeakTopic[]; accent: string; onWork: (topic: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={meta}>{t('weak.title')}</span>
      {topics.length === 0
        ? <p style={small}>{t('weak.none')}</p>
        : (
          <>
            <p style={small}>{t('weak.body')}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {topics.map((w) => (
                <button
                  key={w.topic}
                  style={{ ...chip, borderColor: accent, color: accent, cursor: 'pointer', background: 'none', fontFamily: 'inherit' }}
                  onClick={() => onWork(w.topic)}
                  title={t('weak.use')}
                >
                  {t('weak.chip', { topic: w.topic, misses: w.misses, attempts: w.attempts })}
                </button>
              ))}
            </div>
            <p style={small}>{t('weak.inPrompt')}</p>
          </>
        )}
    </div>
  );
}

/**
 * A card the student can rewrite.
 *
 * 🚨 An edited card is MARKED. A regeneration that silently replaced a card
 * somebody rewrote by hand would be the app overruling the person using it, and
 * `edited` is what lets a later pass know to leave it alone.
 */
function EditableCard({ card, accent, onSave, onDelete }: {
  card: Card; accent: string; onSave: (c: Card) => void; onDelete: (c: Card) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);

  if (editing) {
    return (
      <div style={{ ...cardStyle, borderColor: accent }}>
        <input style={{ ...input, padding: '7px 10px' }} value={front} onChange={(e) => setFront(e.target.value)} aria-label={t('cards.front')} />
        <textarea
          style={{ ...input, padding: '7px 10px', minHeight: '80px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          value={back}
          onChange={(e) => setBack(e.target.value)}
          aria-label={t('cards.back')}
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            style={{ ...primaryButton, padding: '5px 10px', fontSize: '12px' }}
            disabled={!front.trim() || !back.trim()}
            onClick={() => { onSave({ ...card, front: front.trim(), back: back.trim(), edited: true }); setEditing(false); }}
          >
            {t('cards.save')}
          </button>
          <button
            style={{ ...ghostButton, padding: '5px 10px', fontSize: '12px' }}
            onClick={() => { setFront(card.front); setBack(card.back); setEditing(false); }}
          >
            {t('library.cancel')}
          </button>
          <div style={{ flex: 1 }} />
          <button style={{ ...ghostButton, padding: '5px 10px', fontSize: '12px', color: T.bad }} onClick={() => onDelete(card)}>
            {t('cards.delete')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <strong style={{ fontSize: '13px', lineHeight: 1.45 }}>{card.front}</strong>
      <p style={{ ...small, lineHeight: 1.5, margin: 0 }}>{card.back}</p>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={meta}>{t('cards.box', { n: card.box })}</span>
        {card.edited && <span style={{ ...meta, color: accent }}>{t('cards.editedBadge')}</span>}
        <div style={{ flex: 1 }} />
        {[1, 2, 3, 4, 5].map((b) => (
          <span key={b} style={{ width: '6px', height: '6px', borderRadius: '3px', background: b <= card.box ? accent : T.border }} />
        ))}
        <button style={{ ...ghostButton, padding: '3px 7px', fontSize: '11px' }} onClick={() => setEditing(true)}>{t('cards.edit')}</button>
      </div>
    </div>
  );
}

function OldDigest({ points, gloss, accent }: {
  points: string[]; gloss: { term: string; definition: string }[]; accent: string;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <section style={{ ...panel, gap: '8px' }}>
      <h2 style={{ ...h2, fontSize: '15px' }}>{t('fiche.oldDigest')}</h2>
      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {points.map((k, i) => <li key={i} style={{ fontSize: '13px', lineHeight: 1.6 }}>{k}</li>)}
      </ul>
      {gloss.map((g) => (
        <div key={g.term} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '13px', color: accent, minWidth: '140px' }}>{g.term}</strong>
          <span style={{ fontSize: '13px', lineHeight: 1.6, color: T.text }}>{g.definition}</span>
        </div>
      ))}
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div style={{ padding: '26px 4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <h2 style={{ ...h2, fontSize: '16px' }}>{title}</h2>
      <p style={lede}>{body}</p>
    </div>
  );
}

export function GenFailureBox({ code, detail, sketchKind }: {
  code: GenFailure;
  detail?: string | undefined;
  sketchKind?: SketchKind | undefined;
}): JSX.Element {
  const { t } = useI18n();

  if (code === 'EMPTY_RESULT') {
    const body = sketchKind === 'flow' ? t('gen.emptyFlow')
      : sketchKind === 'compare' ? t('gen.emptyCompare')
        : sketchKind === 'timeline' ? t('gen.emptyTimeline')
          : t('gen.emptyGeneric');
    return (
      <div style={noticeBox}>
        <strong>{t('gen.empty')}</strong>
        <p style={{ margin: '6px 0 0' }}>{body}</p>
      </div>
    );
  }

  if (code === 'NO_TEXT') {
    return (
      <div style={errorBox}>
        <strong>{t('gen.noText')}</strong>
        <p style={{ margin: '6px 0 0' }}>{t('gen.noTextBody')}</p>
      </div>
    );
  }

  return (
    <div style={errorBox}>
      <strong>{code === 'MODEL_FAILED' ? t('gen.noModel') : t('gen.unusable')}</strong>
      <p style={{ margin: '6px 0 0' }}>{code === 'MODEL_FAILED' ? t('gen.noModelBody') : t('gen.unusableBody')}</p>
      {detail && <p style={{ ...meta, margin: '6px 0 0' }}>{detail}</p>}
    </div>
  );
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px' };

const navStyle: CSSProperties = { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' };

const dividerStyle: CSSProperties = {
  width: '1px', height: '18px', background: T.border, margin: '0 8px', display: 'inline-block',
};

const tabStyle: CSSProperties = {
  border: 'none',
  borderRadius: '9px',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  padding: '7px 12px',
  cursor: 'pointer',
  transition: 'background 140ms ease, color 140ms ease',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '10px',
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '12px',
};

const cardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '12px',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};
