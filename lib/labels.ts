/**
 * User-facing vocabulary, keyed on developer mode. The data model never changes
 * (card `type` stays 'update' | 'bug', the grouping field stays `version`); only
 * the words shown in the UI do. Dev mode speaks the software/release dialect;
 * off mode speaks a plain project-management dialect for non-technical users.
 *
 * Everything funnels through here so the wording is one edit away — swap these
 * strings (or add a French set) without touching any component.
 */
export type Vocab = {
  update: string;   // short label for a planned item (toggle, tag, filter)
  updates: string;
  bug: string;      // short label for a problem to deal with
  bugs: string;
  // Lowercase noun phrases for composing sentences ("Add …", "What's the …?").
  // Kept separate because the short label isn't always a grammatical noun:
  // off-mode "Urgent" is an adjective, so its noun form is "urgent task".
  updateNoun: string;
  bugNoun: string;
  version: string;  // the group cards live under (colored, completable)
  versions: string;
  merge: string;    // verb for folding one group into another ('Merge' reads dev)
  // Placeholder example for a new group's name. Dev expects semantic versions;
  // off users name freely, so we suggest a plain label instead of "v1.2.0".
  versionExample: string;
};

const DEV: Vocab = {
  update: 'Update', updates: 'Updates',
  bug: 'Bug', bugs: 'Bugs',
  updateNoun: 'update', bugNoun: 'bug',
  version: 'Version', versions: 'Versions',
  merge: 'Merge', versionExample: 'v1.2.0',
};

const PLAIN: Vocab = {
  update: 'Task', updates: 'Tasks',
  bug: 'Urgent', bugs: 'Urgent',
  updateNoun: 'task', bugNoun: 'urgent task',
  version: 'Phase', versions: 'Phases',
  merge: 'Combine', versionExample: 'Launch',
};

export function vocab(devMode: boolean): Vocab {
  return devMode ? DEV : PLAIN;
}
