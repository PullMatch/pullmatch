import type { ReviewerRecommendation } from './index.ts';
import type { ContributorEntry } from './contributor-graph.ts';
import type { ReviewerConfig } from './config.ts';
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
  exclude?: string[];
  weights?: {
    codeowners?: number;
    recency?: number;
    frequency?: number;
  };
  includeCodeowners?: boolean;
  loadBalancing?: boolean;
  maxOpenReviews?: number;
  reviewLoadData?: Map<string, number>;
  teamResolution?: TeamResolutionResult;
}

/**
 * Build MatcherOptions from a RepoConfig's reviewer settings.
 */
export function matcherOptionsFromConfig(config: ReviewerConfig): MatcherOptions {
  return {
    topN: config.count,
    exclude: config.exclude,
    weights: config.weights,
    includeCodeowners: config.includeCodeowners,
    loadBalancing: config.loadBalancing,
    maxOpenReviews: config.maxOpenReviews,
  };
}

/**
 * Score each contributor and return top N, excluding the PR author.
 *
 * Default scoring formula (deterministic):
 *   score = exactCommits * 3 + dirCommits * 1 + recencyScore * 2
 *         + codeOwnerBonus * 4 + teamOwnerBonus * 3
 *
 * When custom weights are provided, the formula uses normalized weights:
 *   score = exactCommits * frequency_w + dirCommits * (frequency_w / 3)
 *         + recencyScore * recency_w + codeOwnerBonus * codeowners_w + teamOwnerBonus * 3
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
  const excludeSet = new Set((opts.exclude ?? []).map((u) => u.toLowerCase()));
  const useCodeowners = opts.includeCodeowners ?? true;
  const useLoadBalancing = opts.loadBalancing ?? false;
  const maxOpenReviews = opts.maxOpenReviews ?? 5;
  const reviewLoadData = opts.reviewLoadData;
  const teamResolution = opts.teamResolution;

  // Scoring weights: default to the original hardcoded weights
  const wFreq = opts.weights?.frequency ?? 0.3;
  const wRecency = opts.weights?.recency ?? 0.3;
  const wCodeowners = opts.weights?.codeowners ?? 0.4;

  // Scale weights so the scoring magnitude is consistent with the original formula
  // Original: exactCommits*3 + dirCommits*1 + recency*2 + codeOwner*4
  // With default weights (0.3, 0.3, 0.4): 0.3*10=3, 0.3*~6.67=~2, 0.4*10=4
  const scale = 10;
  const exactW = wFreq * scale;           // default: 3
  const dirW = wFreq * scale / 3;         // default: 1
  const recencyW = wRecency * scale / 1.5; // default: 2
  const codeownerW = wCodeowners * scale;  // default: 4

  const candidates: Array<{ entry: ContributorEntry; score: number; teamBonus: number; teamSlugs: string[] }> = [];

  for (const entry of graph.values()) {
    if (entry.login === prAuthor) continue;
    if (excludeSet.has(entry.login.toLowerCase())) continue;

    const recency = recencyScore(entry.latestCommit);
    const codeOwnerBonus = (useCodeowners && entry.isCodeOwner) ? (entry.codeOwnerFiles ?? 0) : 0;
    let score =
      entry.exactCommits * exactW + entry.dirCommits * dirW + recency * recencyW + codeOwnerBonus * codeownerW;

    // Team ownership bonus
    let teamBonus = 0;
    let teamSlugs: string[] = [];
    if (teamResolution?.teamOwnerLogins.has(entry.login)) {
      teamSlugs = teamResolution.memberTeams.get(entry.login) ?? [];
      teamBonus = teamSlugs.length * TEAM_OWNER_BONUS;
      score += teamBonus;
    }

    // Apply review load penalty: linear penalty scaling from 0 at 0 reviews to
    // full penalty at maxOpenReviews. Score multiplier goes from 1.0 to 0.2.
    if (useLoadBalancing && reviewLoadData) {
      const openReviews = reviewLoadData.get(entry.login) ?? 0;
      const loadRatio = Math.min(openReviews / maxOpenReviews, 1);
      const loadMultiplier = 1 - (loadRatio * 0.8); // min multiplier is 0.2
      score *= loadMultiplier;
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

    if (useLoadBalancing && reviewLoadData) {
      const openReviews = reviewLoadData.get(entry.login) ?? 0;
      if (openReviews > 0) {
        reasons.push(`Currently reviewing ${openReviews} open PR(s)`);
      }
    }

    return {
      login: entry.login,
      score: Math.round(score * 100) / 100,
      reasons,
    } satisfies ReviewerRecommendation;
  });
}
