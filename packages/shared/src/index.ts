export interface PullRequest {
  id: string;
  repoOwner: string;
  repoName: string;
  number: number;
  title: string;
  author: string;
  filesChanged: string[];
  createdAt: string;
}

export interface ReviewerRecommendation {
  login: string;
  score: number;
  reasons: string[];
}

export interface ContextBrief {
  prId: string;
  reviewer: string;
  summary: string;
  focusAreas: string[];
}

export { fetchPRFiles, fetchRecentCommitters, postPRComment, requestReviewers, GitHubRateLimitError, findExistingComment, updatePRComment, PULLMATCH_MARKER } from './github.ts';
export type { PRFile, Committer, RequestReviewersResult } from './github.ts';
export { buildContributorGraph } from './contributor-graph.ts';
export type { ContributorEntry } from './contributor-graph.ts';
export { matchReviewers, matcherOptionsFromConfig } from './matcher.ts';
export type { MatcherOptions } from './matcher.ts';
export { generateContextBrief } from './context-brief.ts';
export { resolveInstallationToken, clearTokenCache, getTokenCacheSize } from './github-app-auth.ts';
export type { TokenResolverConfig } from './github-app-auth.ts';
export { loadRepoConfig, parseRepoConfig, filterIgnoredFiles, DEFAULT_CONFIG } from './config.ts';
export type { RepoConfig, ReviewerConfig, ReviewerWeights } from './config.ts';
export { parseInstallationEvent, parseInstallationRepositoriesEvent, formatInstallationLog } from './installations.ts';
export type { InstallationEvent, InstallationAction } from './installations.ts';
export { createRequestId, trackEvent, serializeAnalyticsEvent } from './analytics.ts';
export type { AnalyticsEvent, AnalyticsEventName, SerializedAnalyticsEvent, AnalyticsValue } from './analytics.ts';
