'use client';

import type { Project } from '@/lib/types';
import { versionTheme } from '@/lib/util';
import { IconStar } from '@/app/components/icons';
import { initials } from './ProjectCard';

/**
 * The favorites strip: one chip per starred project, above the bands.
 *
 * Favorites used to be a band of its own, drawn with the same cards as every
 * other band — which made a starred project appear twice on one screen and read
 * as a page repeating itself. It is a *shortcut*, so it is now shaped like one:
 * a row of chips you click to jump straight to a board.
 *
 * Nothing here can be dragged, and nothing can be dropped on it. That is the
 * point rather than a shortfall:
 *   · a project's order lives in its band, so a chip has no order to disturb
 *     (they share one global `position` — a bar you could reorder would shuffle
 *     the bands below it);
 *   · starring is the card's star, both ways. Dropping onto a bar could only
 *     ever star, never unstar, and a one-way door is worse than no door.
 */
export default function FavoritesBar({
  projects, onUnfavorite
}: {
  projects: Project[];
  onUnfavorite: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <section className="fav-bar">
      <div className="fav-bar-head">
        <IconStar className="band-star" />
        <h2 className="band-title">Favorites</h2>
        <span className="band-count">{projects.length}</span>
      </div>
      <div className="fav-chips">
        {projects.map((p) => (
          <span key={p.id} className="fav-chip">
            <a className="fav-chip-open" href={'/board?p=' + p.id}>
              <span className={'fav-chip-mark card-theme-' + versionTheme(p.name)}>{initials(p.name)}</span>
              <span className="fav-chip-name">{p.name || 'Untitled'}</span>
            </a>
            <button className="fav-chip-off" title="Remove from favorites"
              aria-label={'Remove ' + (p.name || 'Untitled') + ' from favorites'}
              onClick={() => onUnfavorite(p.id)}>
              <IconStar />
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}
