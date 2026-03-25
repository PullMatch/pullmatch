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
