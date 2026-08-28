/**
 * Product changelog shown in the "What's new" popup. This is about Stackt itself
 * (features we shipped), NOT the updates/bugs users track in their own projects.
 *
 * How the "once per release" gate works: bump `version` whenever you add a new
 * entry worth surfacing. WhatsNew stores the last version each visitor dismissed
 * (localStorage, per-browser); when `version` moves ahead of what they've seen,
 * the popup shows once more, then stays hidden until the next bump.
 *
 * Keep `version` sortable/stable — an ISO date of the release is convenient.
 */
export type ChangeItem = { title: string; body?: string };

export type Changelog = {
  version: string;
  title: string;
  intro?: string;
  items: ChangeItem[];
};

export const CHANGELOG: Changelog = {
  version: '2026-08-19',
  title: "What's new",
  items: [
    { title: 'Groups, where the projects are', body: 'Your projects page is banded by group — make one, name it in place, give it a colour.' },
    { title: 'Drag to organise', body: 'Pull a project into another group, or between two cards to order it. Drag a heading to order the groups.' },
    { title: 'Build your own header', body: 'Favorites, any group, any single project — added, ordered and removed from the board itself.' },
    { title: 'Import a bullet list', body: 'Paste, preview, create.' },
    { title: 'Ship dates', body: 'Give a version a date — it shows up as a milestone.' },
    { title: 'Reminder days', body: 'Weekdays only, or any set you like.' },
  ],
};

export const CHANGELOG_VERSION = CHANGELOG.version;
