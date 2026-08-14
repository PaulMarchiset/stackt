'use client';

import { branchUrl } from '@/lib/util';
import { useBoardDevMode } from '@/lib/devModeContext';
import { IconRepo } from './icons';

/**
 * A small git-branch chip. When the project has a repo URL, it links to the
 * branch (GitHub/GitLab/Bitbucket path styles handled in branchUrl); otherwise
 * it shows the branch name as plain text. stopPropagation keeps a card's own
 * click/double-click handlers from firing when the link is tapped.
 */
export default function BranchChip({ repoUrl, branch }: { repoUrl: string; branch: string }) {
  const devMode = useBoardDevMode();
  const b = (branch || '').trim();
  if (!devMode || !b) return null;
  const url = branchUrl(repoUrl, b);
  const icon = <IconRepo />;
  return url ? (
    <a className="chip branch" href={url} target="_blank" rel="noopener noreferrer"
      title={'Open branch ' + b} onClick={(e) => e.stopPropagation()}>
      {icon}{b}
    </a>
  ) : (
    <span className="chip branch plain" title={b}>{icon}{b}</span>
  );
}
