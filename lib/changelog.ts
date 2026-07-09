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
  version: '2026-07-10',
  title: "What's new",
  intro: 'A few improvements have landed:',
  items: [
    {
      title: 'Your account, tidied up',
      body: 'A new account menu (with your avatar) and a dedicated Settings page where you can set a display name, change your email, and manage your preferences.',
    },
    {
      title: 'A mode per project',
      body: 'Each project can run in Developer or Simple mode — pick it when you create a project or from Edit. The account setting is now just the default.',
    },
    {
      title: 'Reorder your projects',
      body: 'Drag the project tabs in the header to arrange them in whatever order suits you.',
    },
  ],
};

export const CHANGELOG_VERSION = CHANGELOG.version;
