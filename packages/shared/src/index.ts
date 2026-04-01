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
  reviewer: string;
  brief: string;
}

export { fetchPRFiles, fetchPRCommitMessages, fetchRecentCommitters, postPRComment, requestReviewers, getOpenReviewCount, getOpenReviewCounts, GitHubRateLimitError, findExistingComment, updatePRComment, getLatestRateLimitStatus, PULLMATCH_MARKER } from './github.ts';
export type { PRFile, Committer, RequestReviewersResult, GitHubRateLimitStatus } from './github.ts';
export { buildContributorGraph } from './contributor-graph.ts';
export type { ContributorEntry } from './contributor-graph.ts';
export { matchReviewers, matcherOptionsFromConfig } from './matcher.ts';
export type { MatcherOptions } from './matcher.ts';
export { generateContextBrief } from './context-brief.ts';
export { formatReviewerComment } from './formatter.ts';
export { getTeamMembers, parseCodeownersTeams, resolveTeamOwnership, fetchCodeowners } from './teams.ts';
export type { TeamMember, TeamResolutionResult } from './teams.ts';
export { resolveInstallationToken, clearTokenCache, getTokenCacheSize } from './github-app-auth.ts';
export type { TokenResolverConfig } from './github-app-auth.ts';
export { loadRepoConfig, parseRepoConfig, filterIgnoredFiles, DEFAULT_CONFIG } from './config.ts';
export type { RepoConfig, ReviewerConfig, ReviewerWeights, NotificationsConfig, SlackConfig } from './config.ts';
export { formatSlackMessage, sendSlackNotification } from './slack.ts';
export type { SlackMessage, SlackPREvent, SlackReviewer } from './slack.ts';
export { parseInstallationEvent, parseInstallationRepositoriesEvent, formatInstallationLog } from './installations.ts';
export type { InstallationEvent, InstallationAction } from './installations.ts';
export { createRequestId, trackEvent, serializeAnalyticsEvent } from './analytics.ts';
export type { AnalyticsEvent, AnalyticsEventName, SerializedAnalyticsEvent, AnalyticsValue, AnalyticsEventConsumer } from './analytics.ts';
export { StatsCollector } from './stats.ts';
export type { DashboardStats, RecentAnalysis } from './stats.ts';
export { classifyFile, buildExpertiseMap, formatExpertiseTag } from './expertise.ts';
export type { ExpertiseMap, ExpertiseDomain } from './expertise.ts';
export { recordReviewOutcome, getReviewStats, getOutcomesForPR, clearReviewStore } from './review-tracker.ts';
export type { ReviewAction, ReviewOutcome, ReviewerStats } from './review-tracker.ts';
