import { Webhooks } from '@octokit/webhooks';
import { Hono } from 'hono';
import {
  fetchPRFiles,
  buildContributorGraph,
  matchReviewers,
  postPRComment,
  requestReviewers,
  getOpenReviewCounts,
  loadRepoConfig,
  filterIgnoredFiles,
  matcherOptionsFromConfig,
  parseInstallationEvent,
  parseInstallationRepositoriesEvent,
  formatInstallationLog,
  trackEvent,
  createRequestId,
  GitHubRateLimitError,
  generateContextBrief,
  resolveInstallationToken,
  findExistingComment,
  updatePRComment,
  PULLMATCH_MARKER,
  type StatsCollector,
} from '@pullmatch/shared';
import type { ContextBrief, TokenResolverConfig } from '@pullmatch/shared';
import { logger } from './logger.ts';

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
  const graph = await buildContributorGraph(event.owner, event.repoName, filenames, githubToken);

  // 5. Optionally fetch review load data for load balancing
  const matcherOpts = matcherOptionsFromConfig(config.reviewers);
  if (config.reviewers.loadBalancing) {
    const candidateLogins = Array.from(graph.keys()).filter((l) => l !== event.author);
    if (candidateLogins.length > 0) {
      const loadData = await getOpenReviewCounts(event.owner, event.repoName, candidateLogins, githubToken);
      matcherOpts.reviewLoadData = loadData;
      logger.info('Review load data fetched', { pr: event.prNumber, candidates: candidateLogins.length, loaded: loadData.size });
    }
  }

  // 6. Match top reviewers (excluding PR author, applying config)
  const recommendations = matchReviewers(graph, event.author, matcherOpts);

  if (recommendations.length === 0) {
    logger.info('No reviewer candidates found', { pr: event.prNumber });
    trackEvent({
      name: 'analysis_skipped',
      requestId: event.deliveryId,
      properties: {
        reason: 'no_reviewer_candidates',
        repo: event.repo,
        pr_number: event.prNumber,
      },
    }, statsCollector);
    return;
  }

  // 7. Generate context briefs for each reviewer
  const briefs = new Map<string, ContextBrief>();
  for (const rec of recommendations) {
    briefs.set(rec.login, generateContextBrief(
      { title: event.title, branch: event.branch, filesChanged: filenames },
      rec.login,
      graph
    ));
  }

  // 8. Format comment and create or update (dedup on synchronize)
  const comment = formatReviewerComment(event, recommendations, briefs);
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

  // 9. Auto-request reviewers via GitHub API (opt-in)
  if (config.reviewers.autoAssign) {
    const topLogins = recommendations
      .slice(0, config.reviewers.autoAssignCount)
      .map((r) => r.login);

    const result = await requestReviewers(event.owner, event.repoName, event.prNumber, topLogins, githubToken);
    logger.info('Auto-requested reviewers', {
      pr: event.prNumber,
      requested: result.requested,
      failed: result.failed,
    });
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

function formatReviewerComment(
  event: ParsedPREvent,
  recommendations: Array<{ login: string; score: number; reasons: string[] }>,
  briefs: Map<string, ContextBrief>
): string {
  const lines: string[] = [
    PULLMATCH_MARKER,
    '## PullMatch Reviewer Suggestions',
    '',
    `Analyzed **${event.title}** and found ${recommendations.length} suggested reviewer(s) based on code ownership and recent activity.`,
    '',
  ];

  for (const rec of recommendations) {
    lines.push(`### @${rec.login} (score: ${rec.score})`);
    const brief = briefs.get(rec.login);
    if (brief && brief.focusAreas.length > 0) {
      lines.push(`**Focus areas:** ${brief.focusAreas.join(', ')}`);
    }
    for (const reason of rec.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Powered by [PullMatch](https://github.com/pullmatch)_');

  return lines.join('\n');
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
            ? '⚠️ PullMatch was rate-limited by the GitHub API and could not analyze this PR. We will retry on the next push.'
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
