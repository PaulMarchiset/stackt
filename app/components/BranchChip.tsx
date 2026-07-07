'use client';

import { branchUrl } from '@/lib/util';
import { useDevMode } from '@/lib/useDevMode';

/**
 * A small git-branch chip. When the project has a repo URL, it links to the
 * branch (GitHub/GitLab/Bitbucket path styles handled in branchUrl); otherwise
 * it shows the branch name as plain text. stopPropagation keeps a card's own
 * click/double-click handlers from firing when the link is tapped.
 */
export default function BranchChip({ repoUrl, branch }: { repoUrl: string; branch: string }) {
  const [devMode] = useDevMode();
  const b = (branch || '').trim();
  if (!devMode || !b) return null;
  const url = branchUrl(repoUrl, b);
  const icon = (
    <svg viewBox="0 0 24 24"><path d="M6 3V15M6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21C7.65685 21 9 19.6569 9 18M6 15C7.65685 15 9 16.3431 9 18M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 7.65685 16.3431 9 18 9ZM18 9C18 11.3869 17.0518 13.6761 15.364 15.364C13.6761 17.0518 11.3869 18 9 18" /></svg>
  );
  return url ? (
    <a className="chip branch" href={url} target="_blank" rel="noopener noreferrer"
      title={'Open branch ' + b} onClick={(e) => e.stopPropagation()}>
      {icon}{b}
    </a>
  ) : (
    <span className="chip branch plain" title={b}>{icon}{b}</span>
  );
}
