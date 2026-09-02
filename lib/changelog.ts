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

/* A still of the thing this release adds — the gesture, not the button.
   "There is a Share button" is a fact; a field with an address half-typed in it
   and an Invite button beside it is the whole feature in one glance, and it
   answers the question the reader actually has, which is what do I do. */
export type ChangeCapsule = {
  before: string;      // introduces the picture, so it is read as one
  placeholder: string; // what the field prompts for
  action: string;      // the button that acts on it
  opener: string;      // the control that reveals the real thing
  caption: string;     // where that control lives
};

/* Something true and worth telling people that is not what this release is
   about. It goes last and behind a label of its own, so it cannot dilute the
   headline: a reader who stops after the capsule still leaves knowing the main
   thing, and one who reads on is not confused about which is which. */
export type ChangeAside = { label: string; body: string };

export type Changelog = {
  version: string;
  title: string;
  /* Paragraphs. A release that is one idea deserves a sentence, not six
     bullets pretending the idea came in parts. */
  intro?: string[];
  capsule?: ChangeCapsule;
  aside?: ChangeAside;
  items: ChangeItem[];
};

export const CHANGELOG: Changelog = {
  version: '2026-09-02',
  title: 'Bring someone in',
  intro: [
    'Type someone’s email and they land on the board next time they sign in. Then you watch them work — cards appear as they are written, move as they are dragged, no refreshing.',
    'Only the projects you share, with only the people you name. Favourites, ordering and reminders are yours alone now, so starring something no longer stars it for everyone.',
  ],
  capsule: {
    before: '',
    placeholder: 'name@example.com',
    action: 'Invite',
    opener: 'Share',
    caption: 'at the top of your board.'
  },
  aside: {
    label: 'On a separate note',
    body: 'The morning email got quieter: counts and dates, never a task name. It tells you three things are overdue and lets the board tell you which.'
  },
  items: [],
};

export const CHANGELOG_VERSION = CHANGELOG.version;
