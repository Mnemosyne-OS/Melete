/**
 * CourseDocs.tsx — the documents inside a binder, and the three ways one gets in.
 *
 * A course is a set of documents (v2), so this is where the import buttons live
 * now: they add TO the open course rather than creating a new one. Each row
 * reports what Melete measured about that document — characters, passages the
 * vault accepted, whether OCR was involved, how the bytes were read — because
 * those four facts are the difference between "the app did something" and "the
 * app did what it said".
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { preview } from '../lib/chunk';
import type { ImportError, ImportPhase } from '../lib/importCourse';
import { T, button, chip, errorBox, ghostButton, h2, input, lede, meta, panel, primaryButton, small } from '../styles';
import { domainOf } from '../lib/web';
import type { Course, Doc } from '../lib/types';

interface Props {
  course: Course;
  phase: ImportPhase | null;
  error: ImportError | null;
  notice: string | null;
  onImportFile: () => void;
  onImportPhoto: () => void;
  onPaste: (name: string, text: string) => void;
  onWeb: (url: string) => void;
  onRemoveDoc: (doc: Doc) => void;
}

export function CourseDocs(p: Props): JSX.Element {
  const { t } = useI18n();
  const [pasting, setPasting] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [webbing, setWebbing] = useState(false);
  const [url, setUrl] = useState('');
  const busy = p.phase !== null;
  const urlOk = domainOf(url) !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <section style={{ ...panel, gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button style={primaryButton} onClick={p.onImportFile} disabled={busy}>📄 {t('library.importFile')}</button>
          <button style={button} onClick={p.onImportPhoto} disabled={busy}>📷 {t('library.importPhoto')}</button>
          <button style={ghostButton} onClick={() => setPasting((v) => !v)} disabled={busy}>✍️ {t('library.importPaste')}</button>
          <button style={ghostButton} onClick={() => setWebbing((v) => !v)} disabled={busy}>🌐 {t('web.add')}</button>
        </div>

        {webbing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              style={input}
              placeholder={t('web.urlLabel')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {/* ⚖️ Both sentences are load-bearing: what Melete will NOT do with
                this page, and the fact that it never went looking for it. */}
            <p style={small}>{t('web.noSearch')}</p>
            <p style={small}>{t('web.rule')}</p>
            {url.trim() && !urlOk && <p style={{ ...small, color: T.warn }}>{t('web.badUrl')}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={primaryButton}
                disabled={!urlOk || busy}
                onClick={() => { p.onWeb(url.trim()); setWebbing(false); setUrl(''); }}
              >
                {t('web.fetch')}
              </button>
              <button style={ghostButton} onClick={() => setWebbing(false)}>{t('library.cancel')}</button>
            </div>
          </div>
        )}

        {pasting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input style={input} placeholder={t('docs.nameLabel')} value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
            <textarea
              style={{ ...input, minHeight: '150px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              placeholder={t('library.pastePlaceholder')}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <p style={small}>{t('library.pasteHint')}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={primaryButton}
                disabled={!pasteText.trim() || busy}
                onClick={() => { p.onPaste(pasteName, pasteText); setPasting(false); setPasteName(''); setPasteText(''); }}
              >
                {t('library.add')}
              </button>
              <button style={ghostButton} onClick={() => setPasting(false)}>{t('library.cancel')}</button>
            </div>
          </div>
        )}

        {p.phase && <PhaseLine phase={p.phase} />}
        {p.notice && <p style={{ ...small, color: T.good }}>{p.notice}</p>}
        {p.error && <ImportErrorBox error={p.error} />}
      </section>

      {p.course.docs.length === 0 ? (
        <section style={{ ...panel, alignItems: 'flex-start', gap: '8px' }}>
          <h2 style={h2}>{t('docs.emptyTitle')}</h2>
          <p style={lede}>{t('docs.emptyBody')}</p>
        </section>
      ) : (
        p.course.docs.map((doc) => (
          <article key={doc.id} style={{ ...panel, gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <strong style={{ fontSize: '14px', flex: 1 }}>{doc.name}</strong>
              <button style={{ ...ghostButton, padding: '4px 8px', fontSize: '12px' }} onClick={() => p.onRemoveDoc(doc)}>✕</button>
            </div>
            {doc.retained && <p style={{ ...small, lineHeight: 1.5 }}>{preview(doc.retained, 140)}</p>}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={meta}>{t('library.chars', { n: doc.chars.toLocaleString() })}</span>
              <span style={meta}>·</span>
              <span style={meta}>
                {doc.chunks === null ? t('library.passagesUnknown') : t('library.passages', { n: doc.chunks })}
              </span>
              {doc.sourceKind === 'web' && (
                <span style={{ ...chip, color: T.warn, borderColor: T.warn }}>
                  {t('web.badge')} · {domainOf(doc.sourcePath ?? '') ?? '?'}
                </span>
              )}
              {doc.ocr && <span style={chip}>{t('library.ocrBadge')}</span>}
              {doc.truncated && <span style={{ ...chip, color: T.warn, borderColor: T.warn }}>{t('library.truncatedBadge')}</span>}
              {/* Shown only when the host actually reported one — absent is not
                  'utf-8', and claiming a reading nobody made is the defect this
                  whole field exists to prevent. */}
              {doc.encoding && doc.encoding !== 'utf-8' && <span style={chip}>{doc.encoding}</span>}
              {doc.retained === null && (
                <span style={{ ...chip, color: doc.sourcePath ? T.muted : T.warn, borderColor: doc.sourcePath ? T.border : T.warn }}>
                  {doc.sourcePath ? t('library.sourceRereadable') : t('library.sourceGone')}
                </span>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}

export function PhaseLine({ phase }: { phase: ImportPhase }): JSX.Element {
  const { t } = useI18n();
  const label =
    phase.k === 'picking' ? t('import.picking')
      : phase.k === 'reading' ? t('import.reading')
        : phase.k === 'ocr' ? t('import.ocrPage', { page: phase.page, pages: phase.pages })
          : phase.k === 'ocrQueued' ? t('import.ocrQueued')
            : phase.k === 'savingImage' ? t('import.savingImage')
              : t('import.ingesting', { done: phase.done + 1, total: phase.total });

  const pct = phase.k === 'ingesting' ? Math.round((phase.done / Math.max(1, phase.total)) * 100)
    : phase.k === 'ocr' ? Math.round((phase.page / Math.max(1, phase.pages)) * 100)
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ ...meta, color: T.text }}>{label}</span>
      {/* 🚨 No bar when there is no total. A bar parked at 0 % is a very
          convincing way of showing a number nobody measured — an indeterminate
          sweep says "working" without claiming to know how far. */}
      <div style={{ height: '4px', background: T.border, borderRadius: '2px', overflow: 'hidden' }}>
        <div
          style={pct === null
            ? { width: '35%', height: '100%', background: T.accent, animation: 'melete-sweep 1.1s ease-in-out infinite' }
            : { width: `${pct}%`, height: '100%', background: T.accent, transition: 'width 200ms ease' }}
        />
      </div>
    </div>
  );
}

export function ImportErrorBox({ error }: { error: ImportError }): JSX.Element {
  const { t } = useI18n();
  if (error.code === 'CANCELLED') return <></>;
  if (error.code === 'NO_TEXT') return <div style={errorBox}>{t('import.failedEmpty')}</div>;
  return (
    <div style={errorBox}>
      <strong>{t('import.failedRead')}</strong>
      {error.looksLikeScan && <p style={{ margin: '6px 0 0' }}>{t('import.failedOcrHint')}</p>}
      {/* The host's own words, verbatim: a code nobody can look up is still
          more useful than a sentence we invented about a cause we do not know. */}
      <p style={{ ...meta, margin: '6px 0 0' }}>{error.detail}</p>
    </div>
  );
}
