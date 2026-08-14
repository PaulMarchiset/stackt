'use client';

import { useMemo, useState } from 'react';
import type { Version } from '@/lib/types';
import { parseImport, type ImportBlock } from '@/lib/importText';
import { formatDate } from '@/lib/util';
import { vocab } from '@/lib/labels';
import { useBoardDevMode } from '@/lib/devModeContext';
import { IconPlus, IconTick } from '@/app/components/icons';
import Modal from './Modal';

/**
 * Paste a bullet list, get cards.
 *
 * The whole point is that nothing is created until you have seen what will be
 * created: the right-hand column is rendered from the very same parse the writer
 * consumes, including the lines it did not understand. Bulk creation without a
 * preview is a bulk cleanup waiting to happen.
 */
export default function ImportDialog({
  versions, onClose, onImport
}: {
  versions: Version[];
  onClose: () => void;
  onImport: (blocks: ImportBlock[]) => Promise<number>;
}) {
  const v = vocab(useBoardDevMode());
  const word = v.version.toLowerCase();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => parseImport(text), [text]);
  const known = useMemo(() => new Set(versions.map((z) => z.name.toLowerCase())), [versions]);
  const newVersions = result.blocks.filter((b) => b.version && !known.has(b.version.toLowerCase())).length;

  const sample = `[${v.versionExample}]\n- ${v.update} title 15/09\n- Another one 20/09 → 24/09\n- ! Something urgent\n\n[Backlog]\n- No date on this one`;

  async function run() {
    if (busy || result.taskCount === 0) return;
    setBusy(true);
    const n = await onImport(result.blocks);
    setBusy(false);
    if (n > 0) onClose();
  }

  return (
    <Modal title="Import a list" className="modal-wide modal-center import-modal" onClose={onClose}>
      <div className="imp">
        <div className="imp-col">
          <label className="modal-form-label" htmlFor="imp-text">Paste your list</label>
          <textarea id="imp-text" className="imp-text" autoFocus spellCheck={false} placeholder={sample}
            value={text} onChange={(e) => setText(e.target.value)} />
          <div className="imp-help">
            <p><code>[{v.versionExample}]</code> opens a {word} — everything under it lands there.</p>
            <p><code>- Task</code> is a task (<code>*</code>, <code>•</code>, <code>1.</code> work too).</p>
            <p>A date at the end of the line: <code>15/09</code>, <code>15/09/2027</code> or <code>2027-09-15</code>. Add <code>→ 18/09</code> for a range.</p>
            <p><code>!</code> at either end marks it as {v.bug.toLowerCase()}. Bullets before any <code>[{word}]</code> get no {word}.</p>
            <p className="imp-help-note">Day first, and <code>15/09</code> means the current year — write the year to be sure.</p>
          </div>
        </div>

        <div className="imp-col">
          <div className="imp-preview-top">
            <span className="modal-form-label" style={{ margin: 0 }}>Preview</span>
            {result.taskCount > 0 && (
              <span className="imp-summary">
                {result.taskCount} {result.taskCount === 1 ? v.update.toLowerCase() : v.updates.toLowerCase()}
                {newVersions > 0 && ` · ${newVersions} new ${newVersions === 1 ? word : v.versions.toLowerCase()}`}
              </span>
            )}
          </div>

          <div className="imp-preview">
            {result.taskCount === 0 && result.skipped.length === 0 && (
              <p className="imp-empty">Nothing yet — paste a list on the left.</p>
            )}

            {result.blocks.map((b, i) => {
              const isNew = !!b.version && !known.has(b.version.toLowerCase());
              return (
                <div className="imp-block" key={i}>
                  <div className="imp-block-head">
                    {b.version ? (
                      <>
                        <span className="imp-ver">{b.version}</span>
                        <span className={'imp-badge' + (isNew ? ' new' : '')}>
                          {isNew ? <><IconPlus /> new</> : <><IconTick /> exists</>}
                        </span>
                      </>
                    ) : (
                      <span className="imp-ver none">No {word}</span>
                    )}
                  </div>
                  {b.tasks.map((t) => (
                    <div className="imp-task" key={t.line}>
                      <span className="imp-task-title">{t.title}</span>
                      {t.type === 'bug' && <span className="imp-tag bug">{v.bug}</span>}
                      {t.date && (
                        <span className="imp-tag date">
                          {formatDate(t.date)}{t.endDate ? ` → ${formatDate(t.endDate)}` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {result.skipped.length > 0 && (
              <div className="imp-skipped">
                <div className="imp-skipped-head">{result.skipped.length} line{result.skipped.length > 1 ? 's' : ''} ignored</div>
                {result.skipped.map((s) => (
                  <div className="imp-skip" key={s.line}>
                    <span className="imp-skip-n">{s.line}</span>
                    <span className="imp-skip-text">{s.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="edit-actions imp-actions">
        <div className="meta-spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn solid" onClick={run} disabled={busy || result.taskCount === 0}>
          {busy ? 'Importing…' : result.taskCount > 0 ? `Import ${result.taskCount}` : 'Import'}
        </button>
      </div>
    </Modal>
  );
}
