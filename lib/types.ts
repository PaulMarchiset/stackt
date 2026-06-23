export type Status = 'todo' | 'inprogress' | 'done';
export type CardType = 'update' | 'bug';

export interface Card {
  id: string;
  project_id: string;
  title: string;
  version: string;
  target_date: string | null; // YYYY-MM-DD
  status: Status;
  done: boolean;
  type: CardType;
  position: number;
}

export interface Project {
  id: string;
  name: string;
  active_version: string;
  versions: string[];
  completed_versions: string[];
  version_colors: Record<string, number>;
  position: number;
}

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
