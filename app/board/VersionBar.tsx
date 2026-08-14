'use client';

import type { Card, Project, Version } from '@/lib/types';
import { formatDateShort, shipClass, versionColor } from '@/lib/util';
import { vocab } from '@/lib/labels';
import { useBoardDevMode } from '@/lib/devModeContext';
import { IconChevronDown, IconPlus, IconTick } from '@/app/components/icons';

export type TypeFilter = 'all' | 'update' | 'bug';
export type VersionPopAnchor = { id: string; x: number; y: number };

/**
 * The strip under the project name: one chip per version/phase, then the
 * update/bug filter.
 *
 * Order is deliberate — open versions run left to right in their own order,
 * then the completed ones, **most recently completed first**. What you just
 * shipped sits closest to what you're working on; older releases trail off to
 * the right (see sortCompletedVersions).
 */
export default function VersionBar({
  project, projCards, openVersions, completedVersions,
  showCompleted, typeFilter,
  onSelect, onOptions, onAdd, onShowCompleted, onTypeFilter
}: {
  project: Project;
  projCards: Card[];
  openVersions: Version[];
  completedVersions: Version[];      // already sorted newest-completed first
  showCompleted: boolean;
  typeFilter: TypeFilter;
  onSelect: (id: string | null) => void;
  onOptions: (anchor: VersionPopAnchor) => void;
  onAdd: () => void;
  onShowCompleted: (next: boolean) => void;
  onTypeFilter: (next: TypeFilter) => void;
}) {
  const devMode = useBoardDevMode();
  const v = vocab(devMode);
  const active = project.active_version_id;
  const activeVer = [...openVersions, ...completedVersions].find((z) => z.id === active) ?? null;
  const bugCount = projCards.filter((c) => c.type === 'bug' && !c.done).length;

  const chip = (ver: Version) => {
    const count = projCards.filter((c) => c.version_id === ver.id && !c.done).length;
    const ci = versionColor(ver) ?? 0;
    return (
      <button key={ver.id}
        className={'vchip vchip-ver card-theme-' + ci + (ver.id === active ? ' active' : '') + (ver.completed ? ' completed' : '')}
        onClick={() => onSelect(ver.id)}>
        {ver.completed && <span className="vcheck"><IconTick /></span>}
        <span className="vlabel">{ver.name}</span>
        {ver.ship_date && (
          <span className={'vship ' + shipClass(ver)} title={`Ships ${ver.ship_date}`}>
            {formatDateShort(ver.ship_date)}
          </span>
        )}
        <span className="vcount">{count}</span>
        <span className="vopts" title="Color & options"
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOptions({ id: ver.id, x: Math.max(12, r.right + window.scrollX - 176), y: r.bottom + 8 + window.scrollY });
          }}>
          <IconChevronDown />
        </span>
      </button>
    );
  };

  return (
    <div className="version-bar">
      <button className={'vchip' + (active === null ? ' active' : '')} onClick={() => onSelect(null)}>
        <span className="vlabel">{`All ${v.versions.toLowerCase()}`}</span>
        <span className="vcount">{projCards.filter((c) => !c.done).length}</span>
      </button>

      {openVersions.map(chip)}

      {completedVersions.length > 0 && (showCompleted ? (
        <>
          {completedVersions.map(chip)}
          <button className="vchip reveal" onClick={() => onShowCompleted(false)}>Hide completed</button>
        </>
      ) : (
        <>
          {/* The active version stays visible even when it's completed and the
              rest are folded away — otherwise the filter has no on-screen cause. */}
          {activeVer?.completed && chip(activeVer)}
          <button className="vchip reveal" onClick={() => onShowCompleted(true)}>
            <IconTick className="ic" />
            {completedVersions.length} completed
          </button>
        </>
      ))}

      <button className="vchip add" onClick={onAdd}>
        <IconPlus className="ic" /> {v.version}
      </button>

      <div className="type-filter">
        {([['all', 'All'], ['update', v.updates], ['bug', bugCount ? `${v.bugs} · ${bugCount}` : v.bugs]] as const).map(([val, label]) => (
          <button key={val} className={'tf-opt' + (val === 'bug' ? ' bug' : '') + (typeFilter === val ? ' active' : '')}
            onClick={() => onTypeFilter(val)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
