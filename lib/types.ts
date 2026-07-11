export type Status = 'todo' | 'inprogress' | 'done';
export type CardType = 'update' | 'bug';

export interface Version {
  id: string;
  project_id: string;
  name: string;
  color_index: number | null; // palette index 0..5; null = auto (hash of name)
  completed: boolean;
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
  type: CardType;
  branch: string; // git branch name (optional; '' when unset)
  position: number;
}

/* What the card editor emits: card fields plus the typed version *name*
   (resolved to a version_id — creating the version if new — before persisting). */
export type CardDraft = Partial<Card> & { versionName?: string };

export interface Project {
  id: string;
  name: string;
  active_version_id: string | null; // FK → versions.id (source of truth)
  favorite: boolean;
  repo_url: string; // base URL of the git repository (optional; '' when unset)
  position: number;
  dev_mode: boolean | null; // per-project override of developer mode; null = follow the device default
  remind: boolean; // include this project in the daily email reminder
}

export type EmailSection = 'overdue' | 'today' | 'upcoming';

export const EMAIL_SECTIONS: { key: EmailSection; label: string }[] = [
  { key: 'overdue', label: 'En retard' },
  { key: 'today', label: "Dus aujourd'hui" },
  { key: 'upcoming', label: 'À venir' }
];

export interface EmailPrefs {
  user_id: string;
  enabled: boolean;
  subject: string | null; // null = default subject
  horizon_days: number;   // how far ahead "upcoming" reaches
  sections: EmailSection[];
}

export const DEFAULT_EMAIL_PREFS: Omit<EmailPrefs, 'user_id'> = {
  enabled: true,
  subject: null,
  horizon_days: 3,
  sections: ['overdue', 'today', 'upcoming']
};

export interface BoardData {
  projects: Project[];
  cards: Card[];
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
