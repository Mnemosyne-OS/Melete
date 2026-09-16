/**
 * App.tsx — the orchestrator: boot, routing, and the one write path.
 *
 * Every path that changes something goes through `apply()`, which is also the
 * only place that reports a save outcome. That matters because the durable blob
 * is capped (doc 73): a save can succeed AND have shed something, and the
 * student has to be told which — silently losing the source text of three
 * documents is exactly the failure this app must never have.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Header, Rail, type ViewId } from './components/Chrome';
import { CourseView, type GenState } from './components/CourseView';
import { Library } from './components/Library';
import { ProgressView } from './components/Progress';
import { QuizRunner } from './components/QuizRunner';
import { Review } from './components/Review';
import { useI18n } from './i18n/useI18n';
import {
  generateCards, generateFiche, generateMindMap, generatePlan, generateQuiz, generateSketch,
  type GenContext, type GenFailure,
} from './lib/generate';
import { describeTile, ensureSandbox, hasHost } from './lib/host';
import {
  importDocument, importPaste, importPhoto, importWeb, newCourse, rereadSource, RETAIN_CHARS,
  type ImportError, type ImportPhase, type ImportResult,
} from './lib/importCourse';
import { XP, awardBadges, countReview, credit, newlyEarned } from './lib/progress';
import { answerCard, dueCards, newCard } from './lib/schedule';
import { getState, isLoaded, load, mutate, subscribe, type SaveOutcome } from './lib/store';
import { log } from './lib/log';
import { T, button, errorBox, h2, lede, meta, panel, small } from './styles';
import type {
  ArtifactKind, Card, Course, Doc, Intent, MeleteState, QuizAttempt, Scope, SketchKind,
} from './lib/types';

type Boot = { k: 'loading' } | { k: 'ready' } | { k: 'failed'; detail: string };

interface Failure { kind: ArtifactKind; sketchKind?: SketchKind; code: GenFailure; detail?: string }

export default function App(): JSX.Element {
  const { t } = useI18n();
  const [, force] = useState(0);
  const [boot, setBoot] = useState<Boot>({ k: 'loading' });
  const [vault, setVault] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [view, setView] = useState<ViewId>('library');
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [runningQuizId, setRunningQuizId] = useState<string | null>(null);
  const [reviewCourseId, setReviewCourseId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>({ k: 'course' });

  const [phase, setPhase] = useState<ImportPhase | null>(null);
  const [importError, setImportError] = useState<ImportError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<GenState | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);

  const state = getState();
  const now = useMemo(() => new Date(), [state]); // eslint-disable-line react-hooks/exhaustive-deps -- one clock per render pass, so every derived figure on screen agrees with the others

  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  // A congratulation retires itself; a warning does not. "You earned a badge"
  // is read the moment it appears; "Melete released the source text of four
  // documents" is something to act on, and a message that fades before it is
  // read is the same as no message.
  useEffect(() => {
    if (toast?.tone !== 'good') return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (!hasHost()) {
        log.warn('boot', 'no Mnemosyne host — this page is not embedded in the shell');
        setBoot({ k: 'failed', detail: 'NO_HOST' });
        return;
      }
      log.info('boot', 'starting', { lang: document.documentElement.lang });
      try {
        const res = await load();
        if (cancelled) return;
        setBoot({ k: 'ready' });
        if (res.migrated) setToast({ text: t('store.migrated'), tone: 'good' });
      } catch (err) {
        if (!cancelled) setBoot({ k: 'failed', detail: err instanceof Error ? err.message : String(err) });
        return;
      }
      try {
        const sandbox = await ensureSandbox();
        if (cancelled) return;
        log.info('boot', 'vault ready', {
          vault: sandbox.vault, created: sandbox.created, permanenceUnlocked: sandbox.unlocked,
        });
        setVault(sandbox.vault);
        // The tile is decoration for the shell's vault manager: failing to
        // declare it must never cost the student their session.
        await describeTile();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        log.error('boot', 'the vault could not be opened — nothing can be filed', { detail });
        if (!cancelled) setVaultError(detail);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [t]);

  /** The one write path. Reports a shed or a failure; never both silently. */
  const apply = useCallback(async (fn: (s: MeleteState) => MeleteState): Promise<SaveOutcome> => {
    const before = getState().progress.badges;
    const out = await mutate(fn);
    if (!out.ok) {
      setToast({ text: out.error === 'NOT_LOADED' ? t('common.notLoaded') : t('common.saveFailed'), tone: 'bad' });
      return out;
    }
    if (out.shed) {
      const lines = [t('progress.storageShed', { n: out.shed.releasedRereadable + out.shed.releasedLost })];
      if (out.shed.releasedLost > 0) lines.push(t('progress.storageShedLost', { n: out.shed.releasedLost }));
      setToast({ text: lines.join(' '), tone: 'bad' });
      return out;
    }
    const earned = newlyEarned(before, getState().progress.badges);
    if (earned.length > 0) {
      setToast({ text: `🏅 ${earned.map((id) => t(`badge.${id}`)).join(' · ')}`, tone: 'good' });
    }
    return out;
  }, [t]);

  /** Adds XP, marks the day, and re-evaluates the badges against real data. */
  const reward = useCallback((s: MeleteState, xp: number): MeleteState => {
    const withXp = { ...s, progress: credit(s.progress, xp, now) };
    return { ...withXp, progress: { ...withXp.progress, badges: awardBadges(withXp, now) } };
  }, [now]);

  const patchCourse = useCallback((courseId: string, fn: (c: Course) => Course) =>
    (s: MeleteState): MeleteState => ({ ...s, courses: s.courses.map((c) => (c.id === courseId ? fn(c) : c)) }),
  []);

  const course = state.courses.find((c) => c.id === openCourseId) ?? null;

  // ── Import ────────────────────────────────────────────────────────────────

  const runImport = useCallback(async (fn: (vault: string, courseId: string) => Promise<ImportResult>): Promise<void> => {
    if (!course) return;
    if (!vault) {
      setImportError({ code: 'READ_FAILED', detail: vaultError ?? 'NO_VAULT', looksLikeScan: false });
      return;
    }
    setNotice(null);
    setImportError(null);
    try {
      const res = await fn(vault, course.id);
      setPhase(null);
      if (!res.ok) { setImportError(res.error); return; }
      const { doc, ingested, attempted, imageSaved } = res.value;
      const parts = [t('import.done', { title: doc.name })];
      if (imageSaved) parts.push(t('import.imageSaved'), t('import.imageIndexNote'));
      if (ingested !== null && ingested < attempted) parts.push(`${ingested}/${attempted}`);
      setNotice(parts.join(' '));
      await apply((s) => reward(patchCourse(course.id, (c) => ({ ...c, docs: [...c.docs, doc] }))(s), XP.importCourse));
    } catch (err) {
      setPhase(null);
      setImportError({ code: 'READ_FAILED', detail: err instanceof Error ? err.message : String(err), looksLikeScan: false });
    }
  }, [apply, course, patchCourse, reward, t, vault, vaultError]);

  // ── The plan ──────────────────────────────────────────────────────────────

  const onPropose = useCallback(async (): Promise<void> => {
    if (!course) return;
    setProposing(true);
    setProposeError(null);
    try {
      const res = await generatePlan(course, now);
      if (!res.ok) {
        setProposeError(res.code === 'MODEL_FAILED' ? t('gen.noModelBody')
          : res.code === 'NO_TEXT' ? t('plan.needDocs')
            : t('gen.unusableBody'));
        return;
      }
      const proposal = res.value;
      await apply(patchCourse(course.id, (c) => ({
        ...c,
        // Only fill what the human left empty: a proposal must never overwrite
        // a title somebody typed.
        title: c.title || proposal.title,
        subject: c.subject || proposal.subject,
        teacher: c.teacher || proposal.teacher,
        level: c.level || proposal.level,
        plan: proposal.plan,
      })));
    } finally {
      setProposing(false);
    }
  }, [apply, course, now, patchCourse, t]);

  // ── Generation ────────────────────────────────────────────────────────────

  /** The scoped text, re-read from disk when the budget had released it. */
  const ensureText = useCallback(async (c: Course): Promise<boolean> => {
    const missing = c.docs.filter((d) => d.retained === null && d.sourcePath !== null);
    if (missing.length === 0) return c.docs.some((d) => d.retained);
    for (const doc of missing) {
      const text = await rereadSource(doc);
      if (!text) continue;
      await apply(patchCourse(c.id, (cc) => ({
        ...cc,
        docs: cc.docs.map((d) => (d.id === doc.id ? { ...d, retained: text.slice(0, RETAIN_CHARS) } : d)),
      })));
    }
    return getState().courses.find((x) => x.id === c.id)?.docs.some((d) => d.retained) ?? false;
  }, [apply, patchCourse]);

  const onGenerate = useCallback(async (kind: ArtifactKind, feedback: string, sketchKind?: SketchKind): Promise<void> => {
    if (!course) return;
    setBusy({ kind, ...(sketchKind ? { sketchKind } : {}) });
    setFailure(null);
    const fail = (code: GenFailure, detail?: string): void => {
      setFailure({ kind, ...(sketchKind ? { sketchKind } : {}), code, ...(detail ? { detail } : {}) });
    };

    try {
      if (!await ensureText(course)) { fail('NO_TEXT'); return; }
      const fresh = getState().courses.find((c) => c.id === course.id);
      if (!fresh) return;
      const ctx: GenContext = {
        course: fresh, scope, now, attempts: getState().attempts,
        ...(feedback ? { feedback } : {}),
      };

      if (kind === 'map') {
        const res = await generateMindMap(ctx);
        if (!res.ok) { fail(res.code, res.detail); return; }
        await apply((s) => reward({ ...s, maps: [...s.maps, res.value] }, XP.generate));
      } else if (kind === 'sketch') {
        const res = await generateSketch(ctx, sketchKind ?? 'flow');
        if (!res.ok) { fail(res.code, res.detail); return; }
        await apply((s) => reward({ ...s, sketches: [...s.sketches, res.value] }, XP.generate));
      } else if (kind === 'cards') {
        const res = await generateCards(ctx, 20);
        if (!res.ok) { fail(res.code, res.detail); return; }
        const cards: Card[] = res.value.map((c) => newCard(c, now));
        setToast({ text: t('gen.cardsMade', { n: cards.length }), tone: 'good' });
        await apply((s) => reward({ ...s, cards: [...s.cards, ...cards] }, XP.generate));
      } else if (kind === 'quiz') {
        const res = await generateQuiz(ctx, 8);
        if (!res.ok) { fail(res.code, res.detail); return; }
        setToast({ text: t('gen.quizMade', { n: res.value.questions.length }), tone: 'good' });
        await apply((s) => reward({ ...s, quizzes: [...s.quizzes, res.value] }, XP.generate));
      } else {
        const res = await generateFiche(ctx);
        if (!res.ok) { fail(res.code, res.detail); return; }
        await apply((s) => reward({ ...s, fiches: [...s.fiches, res.value] }, XP.generate));
      }
    } catch (err) {
      fail('MODEL_FAILED', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [apply, course, ensureText, now, reward, scope, t]);

  // ── Review & quiz ─────────────────────────────────────────────────────────

  const onAnswer = useCallback((card: Card, correct: boolean): void => {
    void apply((s) => {
      const next = { ...s, cards: s.cards.map((c) => (c.id === card.id ? answerCard(c, correct, now) : c)) };
      const rewarded = reward(next, XP.reviewCard);
      return { ...rewarded, progress: countReview(rewarded.progress, now) };
    });
  }, [apply, now, reward]);

  const onQuizFinish = useCallback((attempt: Omit<QuizAttempt, 'at'>, correct: number): void => {
    void apply((s) => reward(
      { ...s, attempts: [...s.attempts, { ...attempt, at: now.toISOString() }] },
      XP.finishQuiz + correct * XP.quizCorrect,
    ));
  }, [apply, now, reward]);

  // ── Render ────────────────────────────────────────────────────────────────

  const due = useMemo(
    () => dueCards(reviewCourseId ? state.cards.filter((c) => c.courseId === reviewCourseId) : state.cards, now),
    [state.cards, reviewCourseId, now],
  );
  const runningQuiz = state.quizzes.find((q) => q.id === runningQuizId) ?? null;

  if (boot.k === 'failed') {
    return (
      <div style={{ ...panel, margin: '40px', gap: '10px' }}>
        <h2 style={h2}>{boot.detail === 'NO_HOST' ? t('host.missing') : t('host.vaultFailed')}</h2>
        <p style={lede}>{boot.detail === 'NO_HOST' ? t('host.missingBody') : boot.detail}</p>
      </div>
    );
  }

  if (boot.k === 'loading' || !isLoaded()) {
    return <div style={{ ...panel, margin: '40px' }}><p style={small}>🪶 {t('app.name')}…</p></div>;
  }

  return (
    <div style={shellStyle}>
      <style>{'@keyframes melete-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
      <Header state={state} now={now} dueCount={due.length} />

      <div style={bodyStyle}>
        <Rail
          view={view}
          onView={(v) => { setView(v); setOpenCourseId(null); setRunningQuizId(null); setReviewCourseId(null); }}
          dueCount={dueCards(state.cards, now).length}
        />

        <main style={mainStyle}>
          {vaultError && (
            <div style={{ ...errorBox, marginBottom: '14px' }}>
              <strong>{t('host.vaultFailed')}</strong>
              <p style={{ ...meta, margin: '6px 0 0' }}>{vaultError}</p>
            </div>
          )}

          {view === 'library' && (course
            ? (
              <CourseView
                course={course}
                state={state}
                scope={scope}
                onScope={setScope}
                busy={busy}
                failure={failure}
                phase={phase}
                importError={importError}
                notice={notice}
                onImportFile={() => void runImport((v, id) => importDocument(v, id, setPhase, now))}
                onImportPhoto={() => void runImport((v, id) => importPhoto(v, id, setPhase, now))}
                onPaste={(name, text) => void runImport((v, id) => importPaste(v, id, name, text, setPhase, now))}
                onWeb={(url) => void runImport((v, id) => importWeb(v, id, url, setPhase, now))}
                onRemoveDoc={(doc: Doc) => {
                  if (!window.confirm(t('docs.removeConfirm', { name: doc.name }))) return;
                  void apply(patchCourse(course.id, (c) => ({ ...c, docs: c.docs.filter((d) => d.id !== doc.id) })));
                }}
                proposing={proposing}
                proposeError={proposeError}
                onPropose={() => void onPropose()}
                onSavePlan={(patch) => void apply(patchCourse(course.id, (c) => ({ ...c, ...patch })))}
                onValidatePlan={(patch) => void apply(patchCourse(course.id, (c) => ({
                  ...c, ...patch,
                  // The one place validatedAt is ever set: a human pressed it.
                  plan: { ...patch.plan, validatedAt: now.toISOString() },
                })))}
                onIntent={(intent: Intent) => void apply(patchCourse(course.id, (c) => ({ ...c, intent })))}
                onGenerate={(kind, feedback, sk) => void onGenerate(kind, feedback, sk)}
                onEditFiche={(next) => void apply((s) => ({
                  ...s, fiches: s.fiches.map((f) => (f.id === next.id ? next : f)),
                }))}
                onEditCard={(card) => void apply((s) => ({
                  ...s, cards: s.cards.map((c) => (c.id === card.id ? card : c)),
                }))}
                onDeleteCard={(card) => {
                  if (!window.confirm(t('cards.deleteConfirm', { front: card.front }))) return;
                  void apply((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== card.id) }));
                }}
                onStartQuiz={(id) => { setRunningQuizId(id); setView('quiz'); }}
                onReview={(courseId) => { setReviewCourseId(courseId); setView('review'); }}
                onBack={() => { setOpenCourseId(null); setFailure(null); setScope({ k: 'course' }); }}
              />
            )
            : (
              <Library
                state={state}
                onCreate={(title, subject) => {
                  const created = newCourse(title, subject, now);
                  void apply((s) => ({ ...s, courses: [...s.courses, created] }));
                  setOpenCourseId(created.id);
                  setScope({ k: 'course' });
                }}
                onOpen={(c) => { setOpenCourseId(c.id); setFailure(null); setScope({ k: 'course' }); }}
                onRemove={(c) => {
                  const cards = state.cards.filter((x) => x.courseId === c.id).length;
                  const maps = state.maps.filter((x) => x.courseId === c.id).length;
                  const quizzes = state.quizzes.filter((x) => x.courseId === c.id).length;
                  const ok = window.confirm(`${t('library.deleteConfirm', { title: c.title })}\n\n${t('library.deleteDetail', { cards, maps, quizzes })}`);
                  if (!ok) return;
                  void apply((s) => ({
                    ...s,
                    courses: s.courses.filter((x) => x.id !== c.id),
                    cards: s.cards.filter((x) => x.courseId !== c.id),
                    maps: s.maps.filter((x) => x.courseId !== c.id),
                    sketches: s.sketches.filter((x) => x.courseId !== c.id),
                    quizzes: s.quizzes.filter((x) => x.courseId !== c.id),
                    digests: s.digests.filter((x) => x.courseId !== c.id),
                    attempts: s.attempts.filter((x) => x.courseId !== c.id),
                  }));
                }}
              />
            ))}

          {view === 'review' && (
            <Review
              due={due}
              courses={state.courses}
              goal={state.progress.dailyGoal}
              doneToday={state.progress.today?.reviewed ?? 0}
              onAnswer={onAnswer}
              onLeave={() => { setReviewCourseId(null); setView('library'); }}
            />
          )}

          {view === 'quiz' && (runningQuiz
            ? (
              <QuizRunner
                quiz={runningQuiz}
                course={state.courses.find((c) => c.id === runningQuiz.courseId) ?? null}
                onFinish={onQuizFinish}
                onLeave={() => { setRunningQuizId(null); setView('library'); }}
              />
            )
            : (
              <div style={{ ...panel, alignItems: 'flex-start', gap: '10px' }}>
                <h2 style={h2}>{t('quiz.empty')}</h2>
                <p style={lede}>{t('quiz.emptyBody')}</p>
                <button style={button} onClick={() => setView('library')}>{t('cards.backToCourses')}</button>
              </div>
            ))}

          {view === 'progress' && (
            <ProgressView
              state={state}
              now={now}
              onGoal={(n) => void apply((s) => ({ ...s, progress: { ...s.progress, dailyGoal: n } }))}
            />
          )}
        </main>
      </div>

      {toast && (
        <div style={{ ...toastStyle, borderColor: toast.tone === 'good' ? T.good : T.bad }} onClick={() => setToast(null)} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

const shellStyle: CSSProperties = {
  fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)',
  color: T.text,
  background: 'var(--bg-void, #0e0d13)',
  height: '100vh',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  overflow: 'hidden',
};

const bodyStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', minHeight: 0 };

const mainStyle: CSSProperties = { minWidth: 0, minHeight: 0, overflow: 'auto', padding: '22px 26px 48px' };

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: '18px',
  transform: 'translateX(-50%)',
  maxWidth: '620px',
  background: T.surface,
  border: '1px solid',
  borderRadius: '12px',
  padding: '10px 16px',
  fontSize: '13px',
  lineHeight: 1.5,
  cursor: 'pointer',
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
};
