/**
 * ExportBar.tsx — the formats that are real, and nothing else.
 *
 * 🎭 There is deliberately no PDF button. The cartridge cannot write one
 * (doc 103 §7), and a button that offers PDF and produces HTML is a button
 * that works and lies. Instead the HTML export carries a line saying what it
 * is FOR: open it and print to PDF from the browser. That is one more step and
 * it is true, which is the trade this app keeps making.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { exportPngToVault, exportSvgToFolder, exportTextToFolder, type ExportResult } from '../lib/exportSvg';
import { render, type TextFormat } from '../lib/exportArtifact';
import { T, ghostButton, meta, small } from '../styles';

interface Props {
  /** The artifact as markdown — the one source every text format is made from. */
  markdown: string;
  title: string;
  /** Present for the drawings; absent for cards and quizzes. */
  svg?: (() => SVGSVGElement | null) | undefined;
}

export function ExportBar({ markdown, title, svg }: Props): JSX.Element {
  const { t } = useI18n();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const report = (res: ExportResult, kind: string): void => {
    if (res.ok) setResult({ ok: true, text: t('export.written', { kind, path: res.path }) });
    // Cancelling a folder picker is not a failure and must not be reported as one.
    else if (res.code !== 'CANCELLED') setResult({ ok: false, text: res.detail ?? res.code });
  };

  const text = (format: TextFormat) => async (): Promise<void> => {
    setBusy(true);
    try {
      report(await exportTextToFolder(render(markdown, title, format), title, format), format.toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  const drawing = (kind: 'svg' | 'png') => async (): Promise<void> => {
    const el = svg?.();
    if (!el) return;
    setBusy(true);
    try {
      report(kind === 'svg' ? await exportSvgToFolder(el, title) : await exportPngToVault(el, title), kind.toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={meta}>{t('export.label')}</span>
        <button style={ghostButton} disabled={busy} onClick={() => void text('md')()}>Markdown</button>
        <button style={ghostButton} disabled={busy} onClick={() => void text('txt')()}>TXT</button>
        <button style={ghostButton} disabled={busy} onClick={() => void text('html')()}>HTML</button>
        {svg && <button style={ghostButton} disabled={busy} onClick={() => void drawing('svg')()}>SVG</button>}
        {svg && <button style={ghostButton} disabled={busy} onClick={() => void drawing('png')()}>PNG</button>}
      </div>
      <p style={small}>{t('export.pdfNote')}</p>
      {svg && <p style={small}>{t('export.pngNote')}</p>}
      {result && (
        <p style={{ ...meta, color: result.ok ? T.good : T.bad, margin: 0 }}>{result.text}</p>
      )}
    </div>
  );
}
