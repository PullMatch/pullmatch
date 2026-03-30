import type { SerializedAnalyticsEvent } from './analytics.ts';

export interface DashboardStats {
  total_prs_analyzed: number;
  total_reviewers_suggested: number;
  active_installations: number;
  avg_response_ms: number;
}

export interface RecentAnalysis {
  repo: string;
  pr_number: number;
  reviewers_suggested: number;
  timestamp: string;
}

export class StatsCollector {
  private readonly recentLimit: number;
  private totalPrsAnalyzed = 0;
  private totalReviewersSuggested = 0;
  private activeInstallations = 0;
  private totalResponseMs = 0;
  private recent: RecentAnalysis[] = [];

  constructor(recentLimit = 20) {
    this.recentLimit = recentLimit;
  }

  increment(event: SerializedAnalyticsEvent): void {
    if (event.name === 'installation_event') {
      const action = event.properties.action;
      if (action === 'created') {
        this.activeInstallations += 1;
      } else if (action === 'deleted') {
        this.activeInstallations = Math.max(0, this.activeInstallations - 1);
      }
      return;
    }

    if (event.name !== 'analysis_complete') {
      return;
    }

    const repo = event.properties.repo;
    const prNumber = event.properties.pr_number;
    const reviewersSuggested = event.properties.reviewers_suggested;
    const responseMs = event.properties.response_ms;

    if (typeof repo !== 'string' || typeof prNumber !== 'number' || typeof reviewersSuggested !== 'number') {
      return;
    }

    this.totalPrsAnalyzed += 1;
    this.totalReviewersSuggested += reviewersSuggested;

    if (typeof responseMs === 'number') {
      this.totalResponseMs += responseMs;
    }

    this.recent.push({
      repo,
      pr_number: prNumber,
      reviewers_suggested: reviewersSuggested,
      timestamp: event.timestamp,
    });

    if (this.recent.length > this.recentLimit) {
      this.recent = this.recent.slice(this.recent.length - this.recentLimit);
    }
  }

  getStats(): DashboardStats {
    return {
      total_prs_analyzed: this.totalPrsAnalyzed,
      total_reviewers_suggested: this.totalReviewersSuggested,
      active_installations: this.activeInstallations,
      avg_response_ms: this.totalPrsAnalyzed > 0 ? Math.round(this.totalResponseMs / this.totalPrsAnalyzed) : 0,
    };
  }

  getRecent(): RecentAnalysis[] {
    return [...this.recent].reverse();
  }
}
