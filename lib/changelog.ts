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
  version: '2026-08-15',
  title: "What's new",
  items: [
    { title: 'Import a bullet list', body: 'Paste, preview, create.' },
    { title: 'Ship dates', body: 'Give a version a date — it shows up as a milestone.' },
    { title: 'Pick what heads the board', body: 'Favorites, a chosen set, or your own groups.' },
    { title: 'Reminder days', body: 'Weekdays only, or any set you like.' },
    { title: 'Reschedule from the card', body: 'Click a date pill, pick a day.' },
    { title: 'A lighter phone layout', body: 'A floating + button, and more room for the board.' },
  ],
};

export const CHANGELOG_VERSION = CHANGELOG.version;
