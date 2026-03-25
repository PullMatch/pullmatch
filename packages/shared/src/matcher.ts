import type { ReviewerRecommendation } from './index.ts';
import type { ContributorEntry } from './contributor-graph.ts';

const RECENCY_DECAY_DAYS = 90; // commits older than this score 0 for recency

function recencyScore(latestCommit: string): number {
  const ageMs = Date.now() - new Date(latestCommit).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - ageDays / RECENCY_DECAY_DAYS);
}

/**
 * Score each contributor and return top N, excluding the PR author.
 *
 * Scoring formula (deterministic):
 *   score = exactCommits * 3 + dirCommits * 1 + recencyScore * 2
 *
 * Weights rationale:
 * - exactCommits (3x): direct ownership of the changed files
 * - dirCommits (1x): contextual familiarity with the same directories
 * - recency (2x on [0,1]): recent contributors are more likely to be available and up-to-date
 *
 * Tie-breaking: alphabetical by login (stable, deterministic).
 */
export function matchReviewers(
  graph: Map<string, ContributorEntry>,
  prAuthor: string,
  topN = 3
): ReviewerRecommendation[] {
  const candidates: Array<{ entry: ContributorEntry; score: number }> = [];

  for (const entry of graph.values()) {
    if (entry.login === prAuthor) continue;
    const recency = recencyScore(entry.latestCommit);
    const score = entry.exactCommits * 3 + entry.dirCommits * 1 + recency * 2;
    candidates.push({ entry, score });
  }

  // Sort descending by score; alphabetical tie-break for determinism
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.login.localeCompare(b.entry.login);
  });

  return candidates.slice(0, topN).map(({ entry, score }) => {
    const reasons: string[] = [];
    if (entry.exactCommits > 0) {
      reasons.push(`${entry.exactCommits} commit(s) to exact changed file(s)`);
    }
    if (entry.dirCommits > 0) {
      reasons.push(`${entry.dirCommits} commit(s) in the same directory/directories`);
    }
    const ageDays = Math.round(
      (Date.now() - new Date(entry.latestCommit).getTime()) / (1000 * 60 * 60 * 24)
    );
    reasons.push(`Most recent commit was ${ageDays} day(s) ago`);

    return {
      login: entry.login,
      score: Math.round(score * 100) / 100,
      reasons,
    } satisfies ReviewerRecommendation;
  });
}
