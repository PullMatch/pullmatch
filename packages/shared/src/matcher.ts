import type { ReviewerRecommendation } from './index.ts';
import type { ContributorEntry } from './contributor-graph.ts';

const RECENCY_DECAY_DAYS = 90; // commits older than this score 0 for recency

function recencyScore(latestCommit: string): number {
  const ageMs = Date.now() - new Date(latestCommit).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - ageDays / RECENCY_DECAY_DAYS);
}

/**
 * Score each contributor and return top 2, excluding the PR author.
 * Score = fileCount (ownership) * 2 + recencyScore * 1
 */
export function matchReviewers(
  graph: Map<string, ContributorEntry>,
  prAuthor: string,
  topN = 2
): ReviewerRecommendation[] {
  const candidates: Array<{ entry: ContributorEntry; score: number }> = [];

  for (const entry of graph.values()) {
    if (entry.login === prAuthor) continue;
    const score = entry.fileCount * 2 + recencyScore(entry.latestCommit);
    candidates.push({ entry, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, topN).map(({ entry, score }) => {
    const reasons: string[] = [];
    reasons.push(`Modified ${entry.fileCount} of the changed file(s)`);
    const ageDays = Math.round(
      (Date.now() - new Date(entry.latestCommit).getTime()) / (1000 * 60 * 60 * 24)
    );
    reasons.push(`Last commit ${ageDays} day(s) ago`);

    return {
      login: entry.login,
      score: Math.round(score * 100) / 100,
      reasons,
    } satisfies ReviewerRecommendation;
  });
}
