/**
 * In-memory tracker for pull request review outcomes.
 * Stores review actions (approved, changes_requested, commented, dismissed)
 * keyed by repo + PR number, enabling feedback loop for reviewer quality.
 */

export type ReviewAction = 'approved' | 'changes_requested' | 'commented' | 'dismissed';

export interface ReviewOutcome {
  reviewer: string;
  action: ReviewAction;
  timestamp: string;
}

export interface ReviewerStats {
  total: number;
  approved: number;
  changesRequested: number;
  commented: number;
  dismissed: number;
  /** Fraction of reviews that resulted in approval (0–1) */
  approvalRate: number;
}

/** Key format: "owner/repo#prNumber" */
function prKey(repo: string, prNumber: number): string {
  return `${repo}#${prNumber}`;
}

const store = new Map<string, ReviewOutcome[]>();

export function recordReviewOutcome(
  repo: string,
  prNumber: number,
  reviewer: string,
  action: ReviewAction,
  timestamp: string
): void {
  const key = prKey(repo, prNumber);
  const outcomes = store.get(key) ?? [];
  outcomes.push({ reviewer, action, timestamp });
  store.set(key, outcomes);
}

export function getReviewStats(repo: string): Map<string, ReviewerStats> {
  const perReviewer = new Map<string, ReviewerStats>();

  for (const [key, outcomes] of store) {
    // Only include outcomes for the requested repo
    if (!key.startsWith(`${repo}#`)) continue;

    for (const outcome of outcomes) {
      let stats = perReviewer.get(outcome.reviewer);
      if (!stats) {
        stats = { total: 0, approved: 0, changesRequested: 0, commented: 0, dismissed: 0, approvalRate: 0 };
        perReviewer.set(outcome.reviewer, stats);
      }

      stats.total += 1;
      switch (outcome.action) {
        case 'approved':
          stats.approved += 1;
          break;
        case 'changes_requested':
          stats.changesRequested += 1;
          break;
        case 'commented':
          stats.commented += 1;
          break;
        case 'dismissed':
          stats.dismissed += 1;
          break;
      }
      stats.approvalRate = stats.total > 0 ? stats.approved / stats.total : 0;
    }
  }

  return perReviewer;
}

export function getOutcomesForPR(repo: string, prNumber: number): ReviewOutcome[] {
  return store.get(prKey(repo, prNumber)) ?? [];
}

/** Clear all stored data (useful for testing). */
export function clearReviewStore(): void {
  store.clear();
}
