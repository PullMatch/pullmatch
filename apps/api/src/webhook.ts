import { Webhooks } from '@octokit/webhooks';
import { Hono } from 'hono';
import {
  fetchPRFiles,
  fetchPRCommitMessages,
  buildContributorGraph,
  matchReviewers,
  postPRComment,
  requestReviewers,
  getOpenReviewCounts,
  loadRepoConfig,
  filterIgnoredFiles,
  matcherOptionsFromConfig,
  fetchCodeowners,
  annotateCodeowners,
  resolveTeamOwnership,
  parseInstallationEvent,
  parseInstallationRepositoriesEvent,
  formatInstallationLog,
  trackEvent,
  createRequestId,
  GitHubRateLimitError,
  getLatestRateLimitStatus,
  generateContextBrief,
  resolveInstallationToken,
  findExistingComment,
  updatePRComment,
  formatReviewerComment,
  formatSlackMessage,
  sendSlackNotification,
  buildExpertiseMap,
  recordReviewOutcome,
  type StatsCollector,
} from '@pullmatch/shared';
import type { ExpertiseMap, TokenResolverConfig, ReviewAction, TeamResolutionResult } from '@pullmatch/shared';
import type { ContextBrief, ContributorEntry } from '@pullmatch/shared';
import { logger } from './logger.ts';
import { recordWebhookReceived, recordError } from './observability.ts';

export interface ParsedPREvent {
  action: 'opened' | 'synchronize';
  deliveryId: string;
  repo: string;
  owner: string;
  repoName: string;
  prNumber: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  sha: string;
  diffUrl: string;
  htmlUrl: string;
  installationId?: number;
}

async function runAnalysisPipeline(
  event: ParsedPREvent,
  tokenConfig: TokenResolverConfig,
  statsCollector?: StatsCollector
): Promise<void> {
  const startedAtMs = Date.now();
  logger.info('Starting analysis pipeline', { pr: event.prNumber, repo: event.repo });
  trackEvent({
    name: 'pr_received',
    requestId: event.deliveryId,
    properties: {
      repo: event.repo,
      pr_number: event.prNumber,
    },
  }, statsCollector);

  const githubToken = await resolveInstallationToken(event.installationId, tokenConfig);
  if (!githubToken) {
    logger.warn('No GitHub token available — skipping reviewer analysis');
    trackEvent({
      name: 'analysis_skipped',
      requestId: event.deliveryId,
      properties: {
        reason: 'missing_token',
        repo: event.repo,
        pr_number: event.prNumber,
      },
    }, statsCollector);
    return;
  }

  // 1. Load repo config (.pullmatch.yml)
  const config = await loadRepoConfig(event.owner, event.repoName, githubToken);
  logger.info('Repo config loaded', { pr: event.prNumber, ignore: config.ignore.length, reviewerCount: config.reviewers.count });

  // 2. Fetch changed files
  const prFiles = await fetchPRFiles(event.owner, event.repoName, event.prNumber, githubToken);
  if (prFiles.length === 0) {
    logger.info('No files changed — skipping', { pr: event.prNumber });
    trackEvent({
      name: 'analysis_skipped',
      requestId: event.deliveryId,
      properties: {
        reason: 'no_changed_files',
        repo: event.repo,
        pr_number: event.prNumber,
      },
    }, statsCollector);
    return;
  }

  // 3. Filter out ignored files
  const allFilenames = prFiles.map((f) => f.filename);
  const filenames = filterIgnoredFiles(allFilenames, config.ignore);
  logger.info('Files changed', { pr: event.prNumber, total: allFilenames.length, afterFilter: filenames.length });

  if (filenames.length === 0) {
    logger.info('All files matched ignore patterns — skipping', { pr: event.prNumber });
    trackEvent({
      name: 'analysis_skipped',
      requestId: event.deliveryId,
      properties: {
        reason: 'all_files_ignored',
        repo: event.repo,
        pr_number: event.prNumber,
      },
    }, statsCollector);
    return;
  }

  // 4. Build contributor graph from commit history for changed files
  const degradationNotes: string[] = [];
  let graph = new Map<string, ContributorEntry>();
  try {
    graph = await buildContributorGraph(event.owner, event.repoName, filenames, githubToken);
  } catch (err) {
    degradationNotes.push('Contributor graph could not be fully built; using limited PR metadata only.');
    logger.warn('Contributor graph build failed', {
      pr: event.prNumber,
      repo: event.repo,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Optionally enrich contributor graph with CODEOWNERS data
  let teamResolution: TeamResolutionResult | undefined;
  if (config.reviewers.includeCodeowners && graph.size > 0) {
    try {
      const codeownersContent = await fetchCodeowners(event.owner, event.repoName, githubToken);
      if (codeownersContent) {
        annotateCodeowners(graph, codeownersContent, filenames);
        teamResolution = await resolveTeamOwnership(event.owner, codeownersContent, filenames, githubToken);
        if (teamResolution.teamOwnerLogins.size > 0) {
          logger.info('Team ownership resolved', { pr: event.prNumber, teamOwners: teamResolution.teamOwnerLogins.size });
        }
      }
    } catch (err) {
      degradationNotes.push('CODEOWNERS data could not be loaded; scoring proceeds without code ownership signals.');
      logger.warn('CODEOWNERS fetch failed', {
        pr: event.prNumber,
        repo: event.repo,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 6. Optionally fetch review load data for load balancing
  const matcherOpts = matcherOptionsFromConfig(config.reviewers);
  if (teamResolution) {
    matcherOpts.teamResolution = teamResolution;
  }
  if (config.reviewers.loadBalancing) {
    const candidateLogins = Array.from(graph.keys()).filter((l) => l !== event.author);
    if (candidateLogins.length > 0) {
      const loadData = await getOpenReviewCounts(event.owner, event.repoName, candidateLogins, githubToken);
      matcherOpts.reviewLoadData = loadData;
      logger.info('Review load data fetched', { pr: event.prNumber, candidates: candidateLogins.length, loaded: loadData.size });
    }
  }

  // 6. Match top reviewers (excluding PR author, applying config)
  const recommendations = graph.size > 0 ? matchReviewers(graph, event.author, matcherOpts) : [];
  if (recommendations.length === 0) {
    logger.info('No reviewer candidates found', { pr: event.prNumber });
    degradationNotes.push('No reviewer candidates were found from commit history at this time.');
  }

  // 7. Build expertise map from contributor graph
  const expertiseMap: ExpertiseMap = graph.size > 0 ? buildExpertiseMap(graph, filenames) : {};

  // 8. Generate context briefs for each reviewer (if enabled)
  let commitMessages: string[] = [];
  let briefs = new Map<string, ContextBrief>();

  if (config.contextBriefs) {
    try {
      commitMessages = await fetchPRCommitMessages(event.owner, event.repoName, event.prNumber, githubToken);
    } catch (err) {
      degradationNotes.push('Context brief inputs were partially unavailable; suggestions are shown without commit intent details.');
      logger.warn('Commit message fetch failed', {
        pr: event.prNumber,
        repo: event.repo,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const generatedBriefs = generateContextBrief(recommendations, filenames, commitMessages, expertiseMap);
      briefs = new Map(generatedBriefs.map((brief) => [brief.reviewer, brief]));
    } catch (err) {
      degradationNotes.push('Context brief generation failed; reviewer suggestions are shown without briefs.');
      logger.warn('Context brief generation failed', {
        pr: event.prNumber,
        repo: event.repo,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const footerNotes: string[] = [];
  const rateLimit = getLatestRateLimitStatus();
  if (rateLimit?.isLow) {
    const resetText = rateLimit.resetAt ? `, resets at ${rateLimit.resetAt.toISOString()}` : '';
    footerNotes.push(`GitHub API rate limit is low: ${rateLimit.remaining ?? 'unknown'}/${rateLimit.limit ?? 'unknown'} remaining${resetText}.`);
  }

  // 9. Format comment and create or update (dedup on synchronize)
  const comment = formatReviewerComment({
    title: event.title,
    recommendations,
    briefs,
    expertiseMap,
    degradationNotes,
    footerNotes,
  });
  const existingCommentId = await findExistingComment(event.owner, event.repoName, event.prNumber, githubToken);

  if (existingCommentId) {
    await updatePRComment(event.owner, event.repoName, existingCommentId, comment, githubToken);
    logger.info('Updated reviewer suggestions', { pr: event.prNumber, repo: event.repo, commentId: existingCommentId });
  } else {
    await postPRComment(event.owner, event.repoName, event.prNumber, comment, githubToken);
    logger.info('Posted reviewer suggestions', { pr: event.prNumber, repo: event.repo });
  }
  trackEvent({
    name: 'comment_posted',
    requestId: event.deliveryId,
    properties: {
      repo: event.repo,
      pr_number: event.prNumber,
      mode: existingCommentId ? 'update' : 'create',
    },
  }, statsCollector);

  // 10. Auto-request reviewers via GitHub API (opt-in)
  if (config.reviewers.autoAssign) {
    const topLogins = recommendations
      .slice(0, config.reviewers.autoAssignCount)
      .map((r) => r.login);

    if (topLogins.length > 0) {
      const result = await requestReviewers(event.owner, event.repoName, event.prNumber, topLogins, githubToken);
      logger.info('Auto-requested reviewers', {
        pr: event.prNumber,
        requested: result.requested,
        failed: result.failed,
      });
    }
  }

  // 10. Optional Slack notifications (fully opt-in)
  if (config.notifications.slack) {
    const slackMessage = formatSlackMessage(
      {
        title: event.title,
        author: event.author,
        htmlUrl: event.htmlUrl,
        repo: event.repo,
        prNumber: event.prNumber,
      },
      recommendations.map((recommendation) => ({
        login: recommendation.login,
        score: recommendation.score,
      }))
    );

    if (config.notifications.slack.channel) {
      slackMessage.channel = config.notifications.slack.channel;
    }

    try {
      await sendSlackNotification(config.notifications.slack.webhookUrl, slackMessage);
      logger.info('Slack notification sent', { pr: event.prNumber, repo: event.repo });
    } catch (err) {
      logger.warn('Failed to send Slack notification', {
        pr: event.prNumber,
        repo: event.repo,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  trackEvent({
    name: 'analysis_complete',
    requestId: event.deliveryId,
    properties: {
      repo: event.repo,
      pr_number: event.prNumber,
      reviewers_suggested: recommendations.length,
      response_ms: Date.now() - startedAtMs,
    },
  }, statsCollector);
}

export function createWebhookRouter(webhookSecret: string, statsCollector?: StatsCollector): Hono {
  const tokenConfig: TokenResolverConfig = {
    appId: process.env.GITHUB_APP_ID ?? '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY ?? '',
    fallbackToken: process.env.GITHUB_TOKEN_WRITE,
  };
  const webhooks = new Webhooks({ secret: webhookSecret });

  webhooks.on(['pull_request.opened', 'pull_request.synchronize'], ({ id, payload }) => {
    const pr = payload.pull_request;
    const repo = payload.repository;

    const parsed: ParsedPREvent = {
      action: payload.action as 'opened' | 'synchronize',
      deliveryId: id,
      repo: repo.full_name,
      owner: repo.owner.login,
      repoName: repo.name,
      prNumber: payload.number,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      sha: pr.head.sha,
      diffUrl: pr.diff_url,
      htmlUrl: pr.html_url,
      installationId: (payload as Record<string, unknown>).installation
        ? ((payload as Record<string, unknown>).installation as { id: number }).id
        : undefined,
    };

    // Resolve token per-event (installation tokens are short-lived and per-org)
    runAnalysisPipeline(parsed, tokenConfig, statsCollector).catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      recordError(errorMessage);
      logger.error('Pipeline error', { pr: parsed.prNumber, error: errorMessage });
      trackEvent({
        name: 'analysis_error',
        requestId: parsed.deliveryId,
        properties: {
          repo: parsed.repo,
          pr_number: parsed.prNumber,
          error: errorMessage,
        },
      }, statsCollector);

      // Post an error comment on the PR so the user knows what happened
      try {
        const token = await resolveInstallationToken(parsed.installationId, tokenConfig).catch(() => undefined);
        if (token) {
          const isRateLimit = err instanceof GitHubRateLimitError;
          const errorComment = isRateLimit
            ? `⚠️ PullMatch was rate-limited by the GitHub API and paused analysis. Next safe retry is after ${err.resetAt.toISOString()}.`
            : '⚠️ PullMatch encountered an error analyzing this PR. We will retry on the next push.';
          await postPRComment(parsed.owner, parsed.repoName, parsed.prNumber, errorComment, token);
        }
      } catch (commentErr) {
        logger.error('Failed to post error comment', { pr: parsed.prNumber, error: commentErr instanceof Error ? commentErr.message : String(commentErr) });
      }
    });
  });

  webhooks.on(['installation.created', 'installation.deleted'], ({ id, payload }) => {
    const parsed = parseInstallationEvent(payload);
    if (!parsed) {
      return;
    }

    logger.info('GitHub App installation event', {
      deliveryId: id,
      ...formatInstallationLog(parsed),
    });

    trackEvent({
      name: 'installation_event',
      requestId: id,
      properties: {
        action: parsed.action,
        org: parsed.org,
        repoCount: parsed.repos.length,
        installerLogin: parsed.installerLogin,
        installationId: parsed.installationId,
      },
    }, statsCollector);
  });

  webhooks.on(['installation_repositories.added', 'installation_repositories.removed'], ({ id, payload }) => {
    const parsed = parseInstallationRepositoriesEvent(payload);
    if (!parsed) {
      return;
    }

    logger.info('GitHub App installation repositories changed', {
      deliveryId: id,
      ...formatInstallationLog(parsed),
    });

    trackEvent({
      name: 'installation_event',
      requestId: id,
      properties: {
        action: parsed.action,
        org: parsed.org,
        repoCount: parsed.repos.length,
        installerLogin: parsed.installerLogin,
        installationId: parsed.installationId,
      },
    }, statsCollector);
  });

  webhooks.on(['pull_request_review.submitted', 'pull_request_review.dismissed'], ({ id, payload }) => {
    const review = payload.review;
    const pr = payload.pull_request;
    const repo = payload.repository;
    const reviewer = review.user?.login ?? 'unknown';
    const repoFullName = repo.full_name;
    const prNumber = pr.number;

    // Map GitHub review state to our action type
    let action: ReviewAction;
    if (payload.action === 'dismissed') {
      action = 'dismissed';
    } else {
      // submitted event — review.state is 'approved', 'changes_requested', or 'commented'
      const state = review.state?.toLowerCase();
      if (state === 'approved') {
        action = 'approved';
      } else if (state === 'changes_requested') {
        action = 'changes_requested';
      } else {
        action = 'commented';
      }
    }

    const timestamp = review.submitted_at ?? new Date().toISOString();

    recordReviewOutcome(repoFullName, prNumber, reviewer, action, timestamp);

    logger.info('Review outcome recorded', {
      deliveryId: id,
      repo: repoFullName,
      pr: prNumber,
      reviewer,
      action,
    });

    trackEvent({
      name: 'review_completed',
      requestId: id,
      properties: {
        repo: repoFullName,
        pr_number: prNumber,
        reviewer,
        action,
      },
    }, statsCollector);
  });

  const router = new Hono();

  router.post('/webhook', async (c) => {
    const requestId = createRequestId();
    c.header('X-PullMatch-Request-Id', requestId);

    const signature = c.req.header('X-Hub-Signature-256');
    const eventName = c.req.header('X-GitHub-Event');
    const deliveryId = c.req.header('X-GitHub-Delivery') ?? 'unknown';

    if (!signature) {
      return c.json({ error: 'Missing X-Hub-Signature-256 header' }, 400);
    }
    if (!eventName) {
      return c.json({ error: 'Missing X-GitHub-Event header' }, 400);
    }

    logger.info('Webhook received', { event: eventName, deliveryId, requestId });
    recordWebhookReceived();

    const rawBody = await c.req.text();

    try {
      await webhooks.verifyAndReceive({
        id: deliveryId,
        name: eventName as Parameters<typeof webhooks.verifyAndReceive>[0]['name'],
        signature,
        payload: rawBody,
      });
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Webhook processing failed', { event: eventName, deliveryId, requestId, error: message });
      // Return 400 for signature failures, keeping 5xx for unexpected errors
      return c.json({ error: 'Webhook verification or processing failed' }, 400);
    }
  });

  return router;
}
