export type Status = 'todo' | 'inprogress' | 'done';
export type CardType = 'update' | 'bug';

export interface Version {
  id: string;
  project_id: string;
  name: string;
  color_index: number | null; // palette index 0..5; null = auto (hash of name)
  completed: boolean;
  completed_at: string | null; // ISO timestamp of when it was completed; null while open
  ship_date: string | null;    // YYYY-MM-DD — the milestone this version aims at
  position: number;
}

export interface Card {
  id: string;
  project_id: string;
  title: string;
  comment: string; // longer description / notes (optional; '' when unset)
  version_id: string | null; // FK → versions.id (source of truth)
  target_date: string | null; // YYYY-MM-DD — start day
  end_date: string | null;    // YYYY-MM-DD — optional last day (multi-day cards)
  status: Status;
  done: boolean;
  done_at: string | null; // ISO timestamp of when it was checked; null while open
  type: CardType;
  branch: string; // git branch name (optional; '' when unset)
  position: number;
}

/* What the card editor emits: card fields plus the chosen version *name*
   (resolved to a version_id before persisting; '' means "no version"). */
export type CardDraft = Partial<Card> & { versionName?: string };

/* What the board is editing right now — an existing card, or a new one headed
   for a given column. `null` (the state, not this type) means nothing is open.
   The store's submitCard takes the same value, so the board hands its edit
   target straight through instead of re-deriving what the user is doing. */
export type EditTarget =
  | { kind: 'edit'; id: string }
  | { kind: 'new'; status: Status };

export interface Project {
  id: string;
  name: string;
  active_version_id: string | null; // FK → versions.id (source of truth)
  group_id: string | null; // FK → project_groups.id; null = ungrouped
  favorite: boolean;
  pinned: boolean; // hand-picked for the header in 'custom' mode
  repo_url: string; // base URL of the git repository (optional; '' when unset)
  position: number;
  dev_mode: boolean | null; // per-project override of developer mode; null = follow the device default
  remind: boolean; // include this project in the daily email reminder
}

/* A named, ordered island of projects. Used to segment the board header; a
   project belongs to at most one. */
export interface ProjectGroup {
  id: string;
  user_id: string;
  name: string;
  color_index: number | null; // palette index 0..5; null = auto (hash of name)
  position: number;
}

/* Which projects head the board:
   · favorites — the starred ones (the default; no setup required)
   · custom    — a hand-picked set (projects.pinned)
   · groups    — every group, side by side as islands            */
export type HeaderMode = 'favorites' | 'custom' | 'groups';

export const HEADER_MODES: { key: HeaderMode; label: string; hint: string }[] = [
  { key: 'favorites', label: 'Favorites', hint: 'The projects you starred' },
  { key: 'custom', label: 'Chosen', hint: 'A set you pick by hand' },
  { key: 'groups', label: 'Groups', hint: 'Your groups, side by side' }
];

/* Account-wide settings. A missing row means these defaults. */
export interface UserPrefs {
  user_id: string;
  header_mode: HeaderMode;
}

export const DEFAULT_USER_PREFS: Omit<UserPrefs, 'user_id'> = {
  header_mode: 'favorites'
};

export type EmailSection = 'overdue' | 'today' | 'upcoming' | 'undated' | 'milestones';

/* Labels for the settings UI. The email's own section titles live in
   lib/email/template.ts — changing these does not change what gets sent.
   Adding a key here also needs the email_prefs.sections CHECK to allow it
   (see supabase/migrations/0004 and 0006). */
export const EMAIL_SECTIONS: { key: EmailSection; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'undated', label: 'No date' },
  { key: 'milestones', label: 'Milestones' }
];

/* Weekday numbering follows JS getDay(): 0 = Sunday … 6 = Saturday. The list is
   ordered Monday-first because that's how the week is read where the product is
   used — the *values* are what the database stores, the order is presentation. */
export const WEEKDAYS: { day: number; short: string; label: string }[] = [
  { day: 1, short: 'M', label: 'Monday' },
  { day: 2, short: 'T', label: 'Tuesday' },
  { day: 3, short: 'W', label: 'Wednesday' },
  { day: 4, short: 'T', label: 'Thursday' },
  { day: 5, short: 'F', label: 'Friday' },
  { day: 6, short: 'S', label: 'Saturday' },
  { day: 0, short: 'S', label: 'Sunday' }
];

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];

export interface EmailPrefs {
  user_id: string;
  enabled: boolean;
  subject: string | null; // null = default subject
  horizon_days: number;   // how far ahead "upcoming" reaches
  sections: EmailSection[];
  days: number[];         // weekdays the reminder may send on (0 = Sunday)
}

export const DEFAULT_EMAIL_PREFS: Omit<EmailPrefs, 'user_id'> = {
  enabled: true,
  subject: null,
  horizon_days: 3,
  sections: ['overdue', 'today', 'upcoming'],
  days: EVERY_DAY
};

export interface BoardData {
  projects: Project[];
  cards: Card[];
}

/* The contract <Timeline> (desktop) and <Agenda> (mobile) both satisfy, so the
   board can swap one for the other behind useIsMobile() with no other change.
   Declared once here rather than twice in the two components. */
export interface TimelineViewProps {
  project: Project;
  projCards: Card[];        // every card of the project (unfiltered)
  versions: Version[];      // this project's versions, in display order
  cards: Card[];            // the cards in scope (version + type filters applied)
  editing: EditTarget | null;
  newCardDate: string;
  onAdd: (date: string) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onMenu?: (id: string) => void;          // mobile only: opens the card action sheet
  onReschedule: (id: string, date: string) => void;
  onCreateVersion: (name: string) => Promise<Version | null>;
  onSubmit: (v: CardDraft) => void;
  onCancel: () => void;
}

export const COLUMNS: { key: Status; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'inprogress', label: 'In progress' },
  { key: 'done', label: 'Done' }
];

export const PALETTE = [
  { name: 'Green', dot: '#4BAE6A' },
  { name: 'Amber', dot: '#E6B400' },
  { name: 'Purple', dot: '#845EF7' },
  { name: 'Teal', dot: '#13A07C' },
  { name: 'Blue', dot: '#2D7FD6' },
  { name: 'Pink', dot: '#E0568F' }
];
