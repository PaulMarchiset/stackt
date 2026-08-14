'use client';

import { useState } from 'react';
import { PALETTE, type Version } from '@/lib/types';
import { versionColor } from '@/lib/util';
import { vocab } from '@/lib/labels';
import { useBoardDevMode } from '@/lib/devModeContext';
import Sheet from '@/app/components/Sheet';
import { IconChevronDown, IconMerge, IconReopen, IconTick, IconTrash } from '@/app/components/icons';
import DateField from './DateField';

/**
 * Everything you can do to a version/phase from its chip: rename, recolour,
 * complete/reopen, merge into another, delete. Two faces of the same menu —
 * a popover on desktop, a bottom sheet on touch.
 */

/* Commit whatever is typed in the open rename field. Closing the menu unmounts
   the input, and React fires no blur on unmount — so clicking away would
   silently drop the edit unless the live value is read first. Tagged with a
   dedicated attribute because a plain `.sheet-rename input` would also match
   the project-rename sheet. */
export function pendingVersionName(): string {
  return document.querySelector<HTMLInputElement>('[data-version-rename]')?.value ?? '';
}

export type VersionMenuActions = {
  onPickColor: (idx: number) => void;
  onToggleComplete: () => void;
  onRename: (name: string) => void;
  onShipDate: (date: string | null) => void;
  onMerge: (targetName: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

/* The ship date row, shared by the popover and the sheet. Setting a day here is
   what turns a version into a milestone on the timeline — so it says so. */
function ShipDateRow({ version, label, onShipDate }: {
  version: Version; label: string; onShipDate: (date: string | null) => void;
}) {
  return (
    <div className="pop-ship">
      <span className="pop-ship-label">{label}</span>
      <DateField value={version.ship_date ?? ''} placeholder="No date"
        onChange={(d) => onShipDate(d || null)} />
    </div>
  );
}

/* A custom select: looks like a dropdown but the options are real, styleable
   elements (native <option> can't be styled on iOS/macOS). */
function MergeSelect({ versions, verb, onPick }: { versions: string[]; verb: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'merge-select' + (open ? ' open' : '')}>
      <button className="merge-trigger" onClick={() => setOpen((o) => !o)}>
        <IconMerge />
        <span>{`${verb} into…`}</span>
        <IconChevronDown className="merge-chevron" />
      </button>
      {open && (
        <div className="merge-menu">
          {versions.map((v) => (
            <button key={v} className="merge-opt" onClick={() => onPick(v)}>{v}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VersionPopover({
  version, x, y, others, onPickColor, onToggleComplete, onRename, onShipDate, onMerge, onDelete
}: VersionMenuActions & { version: Version; x: number; y: number; others: string[] }) {
  const v = vocab(useBoardDevMode());
  const word = v.version.toLowerCase();
  return (
    <div className="color-pop" style={{ top: y, left: x }}>
      <input className="pop-rename" data-version-rename defaultValue={version.name} spellCheck={false}
        aria-label={`${v.version} name`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRename((e.target as HTMLInputElement).value); } }}
        onBlur={(e) => onRename(e.target.value)} />
      <div className="color-row">
        {PALETTE.map((c, i) => (
          <button key={i} className={'color-opt' + (versionColor(version) === i ? ' sel' : '')}
            style={{ background: c.dot }} title={c.name} onClick={() => onPickColor(i)} />
        ))}
      </div>
      <div className="pop-div" />
      <ShipDateRow version={version} label="Ship date" onShipDate={onShipDate} />
      <div className="pop-div" />
      <button className={'pop-action' + (version.completed ? '' : ' done')} onClick={onToggleComplete}>
        {version.completed
          ? <><IconReopen /> {`Reopen ${word}`}</>
          : <><IconTick /> Mark completed</>}
      </button>
      {others.length > 0 && <MergeSelect versions={others} verb={v.merge} onPick={onMerge} />}
      <button className="pop-action danger" onClick={onDelete}>
        <IconTrash /> {`Delete ${word}`}
      </button>
    </div>
  );
}

export function VersionSheet({
  version, others, onPickColor, onToggleComplete, onRename, onShipDate, onMerge, onDelete, onClose
}: VersionMenuActions & { version: Version; others: string[] }) {
  const v = vocab(useBoardDevMode());
  const word = v.version.toLowerCase();
  return (
    <Sheet title={version.name} onClose={onClose}>
      <div className="sheet-rename">
        <label>{`Rename ${word}`}</label>
        <input className="auth-input" data-version-rename defaultValue={version.name} spellCheck={false}
          onBlur={(e) => onRename(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>
      <div className="sheet-section-label">Color</div>
      <div className="color-row">
        {PALETTE.map((c, i) => (
          <button key={i} className={'color-opt' + (versionColor(version) === i ? ' sel' : '')}
            style={{ background: c.dot }} title={c.name} onClick={() => onPickColor(i)} />
        ))}
      </div>
      <div className="sheet-section-label">Ship date</div>
      <ShipDateRow version={version} label={`When this ${word} is due to land`} onShipDate={onShipDate} />
      <button className={'sheet-item' + (version.completed ? '' : ' done')} onClick={onToggleComplete}>
        {version.completed ? `Reopen ${word}` : 'Mark completed'}
      </button>
      {others.length > 0 && (
        <>
          <div className="sheet-section-label">{`${v.merge} into`}</div>
          <MergeSelect versions={others} verb={v.merge} onPick={onMerge} />
        </>
      )}
      <button className="sheet-item danger" onClick={onDelete}>{`Delete ${word}`}</button>
    </Sheet>
  );
}
