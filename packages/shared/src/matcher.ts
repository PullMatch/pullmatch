import type { ReviewerRecommendation } from './index.ts';
import type { ContributorEntry } from './contributor-graph.ts';
import type { TeamResolutionResult } from './teams.ts';

const RECENCY_DECAY_DAYS = 90; // commits older than this score 0 for recency
const TEAM_OWNER_BONUS = 3; // bonus per team that owns changed files

function recencyScore(latestCommit: string): number {
  const ageMs = Date.now() - new Date(latestCommit).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - ageDays / RECENCY_DECAY_DAYS);
}

export interface MatcherOptions {
  topN?: number;
  teamResolution?: TeamResolutionResult;
}

/**
 * Score each contributor and return top N, excluding the PR author.
 *
 * Scoring formula (deterministic):
 *   score = exactCommits * 3 + dirCommits * 1 + recencyScore * 2
 *         + codeOwnerBonus * 4 + teamOwnerBonus * 3
 *
 * When teamResolution is provided, members of teams that own changed files
 * get a bonus of 3 per owning team. This stacks with individual CODEOWNERS.
 *
 * Tie-breaking: alphabetical by login (stable, deterministic).
 */
export function matchReviewers(
  graph: Map<string, ContributorEntry>,
  prAuthor: string,
  topNOrOptions?: number | MatcherOptions
): ReviewerRecommendation[] {
  const opts: MatcherOptions = typeof topNOrOptions === 'number'
    ? { topN: topNOrOptions }
    : (topNOrOptions ?? {});

  const topN = opts.topN ?? 3;
  const teamResolution = opts.teamResolution;

  const candidates: Array<{ entry: ContributorEntry; score: number; teamBonus: number; teamSlugs: string[] }> = [];

  for (const entry of graph.values()) {
    if (entry.login === prAuthor) continue;
    const recency = recencyScore(entry.latestCommit);
    const codeOwnerBonus = entry.isCodeOwner ? (entry.codeOwnerFiles ?? 0) : 0;
    let score =
      entry.exactCommits * 3 + entry.dirCommits * 1 + recency * 2 + codeOwnerBonus * 4;

    // Team ownership bonus
    let teamBonus = 0;
    let teamSlugs: string[] = [];
    if (teamResolution?.teamOwnerLogins.has(entry.login)) {
      teamSlugs = teamResolution.memberTeams.get(entry.login) ?? [];
      teamBonus = teamSlugs.length * TEAM_OWNER_BONUS;
      score += teamBonus;
    }

    candidates.push({ entry, score, teamBonus, teamSlugs });
  }

  // Sort descending by score; alphabetical tie-break for determinism
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.login.localeCompare(b.entry.login);
  });

  return candidates.slice(0, topN).map(({ entry, score, teamBonus, teamSlugs }) => {
    const reasons: string[] = [];
    if (entry.exactCommits > 0) {
      reasons.push(`${entry.exactCommits} commit(s) to exact changed file(s)`);
    }
    if (entry.dirCommits > 0) {
      reasons.push(`${entry.dirCommits} commit(s) in the same directory/directories`);
    }
    if (entry.isCodeOwner) {
      reasons.push(`Designated code owner for ${entry.codeOwnerFiles ?? 0} changed file(s)`);
    }
    if (teamBonus > 0) {
      reasons.push(`Member of team(s) owning changed files: ${teamSlugs.join(', ')}`);
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
