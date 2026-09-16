/**
 * FicheEditor.tsx — rewriting the sheet by hand.
 *
 * The sheet is the artifact a student will actually hand to somebody else, so
 * it is the one worth being able to fix. What is editable is what the model
 * gets wrong in practice: a heading that is really a sentence, a line that
 * misses the point, a definition in the wrong words, a "remember" that is not
 * what the exam will ask.
 *
 * 🚨 What is NOT editable here is the QUOTE under each concept. It is the
 * excerpt the claim came from, and a quote somebody can retype is not evidence
 * of anything. Editing the line while the quote stays put is exactly right: the
 * student's wording, the course's proof.
 *
 * ⛔ Deleting a concept deletes the links that touched it, here, at the moment
 * of the edit — a link to a concept that no longer exists would be dropped
 * silently at layout time, and a sheet that quietly loses arrows is a sheet
 * nobody trusts.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { T, ghostButton, input, meta, panel, primaryButton, small } from '../styles';
import type { FicheDoc } from '../lib/types';

export function FicheEditor({ doc, onSave, onCancel }: {
  doc: FicheDoc;
  onSave: (next: FicheDoc) => void;
  onCancel: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [draft, setDraft] = useState<FicheDoc>(doc);

  const setConcept = (id: string, patch: { title?: string; line?: string }): void => {
    setDraft((d) => ({ ...d, concepts: d.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  };

  const removeConcept = (id: string): void => {
    setDraft((d) => ({
      ...d,
      concepts: d.concepts.filter((c) => c.id !== id),
      links: d.links.filter((l) => l.from !== id && l.to !== id),
    }));
  };

  const setRemember = (i: number, value: string): void => {
    setDraft((d) => ({ ...d, remember: d.remember.map((r, j) => (j === i ? value : r)) }));
  };

  const setGloss = (i: number, patch: { term?: string; definition?: string }): void => {
    setDraft((d) => ({ ...d, glossary: d.glossary.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  };

  /** Empty fields are dropped on save rather than drawn as blank blocks. */
  const save = (): void => {
    onSave({
      ...draft,
      title: draft.title.trim(),
      concepts: draft.concepts
        .map((c) => ({ ...c, title: c.title.trim(), line: c.line.trim() }))
        .filter((c) => c.title && c.line),
      glossary: draft.glossary
        .map((g) => ({ term: g.term.trim(), definition: g.definition.trim() }))
        .filter((g) => g.term && g.definition),
      remember: draft.remember.map((r) => r.trim()).filter(Boolean),
    });
  };

  const tooFew = draft.concepts.filter((c) => c.title.trim() && c.line.trim()).length < 3;

  return (
    <section style={{ ...panel, gap: '14px' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={meta}>{t('plan.title')}</span>
        <input style={input} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={meta}>{t('ficheEdit.concepts')}</span>
        {draft.concepts.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ ...meta, minWidth: '18px' }}>{i + 1}</span>
              <input
                style={{ ...input, flex: 1 }}
                value={c.title}
                onChange={(e) => setConcept(c.id, { title: e.target.value })}
                placeholder={t('ficheEdit.conceptTitle')}
              />
              <button style={{ ...ghostButton, padding: '4px 8px', fontSize: '12px' }} onClick={() => removeConcept(c.id)}>✕</button>
            </div>
            <input
              style={{ ...input, marginLeft: '24px' }}
              value={c.line}
              onChange={(e) => setConcept(c.id, { line: e.target.value })}
              placeholder={t('ficheEdit.conceptLine')}
            />
            {/* The excerpt is shown and NOT editable: it is the proof, and proof
                somebody can retype proves nothing. */}
            {c.quote && <p style={{ ...small, marginLeft: '24px', fontStyle: 'italic' }}>« {c.quote} »</p>}
          </div>
        ))}
        {tooFew && <p style={{ ...small, color: T.warn }}>{t('ficheEdit.needThree')}</p>}
      </div>

      {draft.glossary.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={meta}>{t('digest.glossary')}</span>
          {draft.glossary.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <input style={{ ...input, width: '180px' }} value={g.term} onChange={(e) => setGloss(i, { term: e.target.value })} />
              <input style={{ ...input, flex: 1, minWidth: '200px' }} value={g.definition} onChange={(e) => setGloss(i, { definition: e.target.value })} />
            </div>
          ))}
        </div>
      )}

      {draft.remember.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={meta}>{t('fiche.remember')}</span>
          {draft.remember.map((r, i) => (
            <input key={i} style={input} value={r} onChange={(e) => setRemember(i, e.target.value)} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button style={primaryButton} disabled={tooFew} onClick={save}>{t('cards.save')}</button>
        <button style={ghostButton} onClick={onCancel}>{t('library.cancel')}</button>
      </div>
    </section>
  );
}
