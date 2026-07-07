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
  version: '2026-07-08',
  title: "What's new",
  intro: 'A few improvements have landed:',
  items: [
    {
      title: 'Simplified mode',
      body: 'Turn off developer mode in Settings and the board speaks plain project-management — tasks, phases and urgent flags instead of updates, versions and bugs.',
    },
    {
      title: 'Name things your way',
      body: 'Group your work into phases called whatever makes sense to you — “Launch”, “Q3”, “Season 2” — instead of being nudged toward version numbers.',
    },
  ],
};

export const CHANGELOG_VERSION = CHANGELOG.version;
