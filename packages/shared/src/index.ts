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

export { fetchPRFiles, fetchRecentCommitters, postPRComment } from './github.ts';
export type { PRFile, Committer } from './github.ts';
export { buildContributorGraph } from './contributor-graph.ts';
export type { ContributorEntry } from './contributor-graph.ts';
export { matchReviewers } from './matcher.ts';
export { getInstallationToken, getAppConfigFromEnv, resolveGitHubToken } from './github-app-auth.ts';
export type { GitHubAppConfig, InstallationToken } from './github-app-auth.ts';
