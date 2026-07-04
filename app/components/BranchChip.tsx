'use client';

import { branchUrl } from '@/lib/util';

/**
 * A small git-branch chip. When the project has a repo URL, it links to the
 * branch (GitHub/GitLab/Bitbucket path styles handled in branchUrl); otherwise
 * it shows the branch name as plain text. stopPropagation keeps a card's own
 * click/double-click handlers from firing when the link is tapped.
 */
export default function BranchChip({ repoUrl, branch }: { repoUrl: string; branch: string }) {
  const b = (branch || '').trim();
  if (!b) return null;
  const url = branchUrl(repoUrl, b);
  const icon = (
    <svg viewBox="0 0 16 16"><circle cx="4" cy="3.5" r="1.5" /><circle cx="4" cy="12.5" r="1.5" /><circle cx="12" cy="4" r="1.5" /><path d="M4 5v6M12 5.5V7a3 3 0 0 1-3 3H4" /></svg>
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
