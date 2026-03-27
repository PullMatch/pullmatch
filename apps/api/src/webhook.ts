import { Webhooks } from '@octokit/webhooks';
import { Hono } from 'hono';
import {
  fetchPRFiles,
  fetchPRCommitMessages,
  buildContributorGraph,
  matchReviewers,
  generatePRContextBrief,
  postPRComment,
} from '../../../packages/shared/src/index.ts';
import type { ReviewerRecommendation, ReviewerContextSection } from '../../../packages/shared/src/index.ts';

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
}

interface AnalysisPipelineDeps {
  fetchPRFiles: typeof fetchPRFiles;
  fetchPRCommitMessages: typeof fetchPRCommitMessages;
  buildContributorGraph: typeof buildContributorGraph;
  matchReviewers: typeof matchReviewers;
  generatePRContextBrief: typeof generatePRContextBrief;
  postPRComment: typeof postPRComment;
}

const defaultPipelineDeps: AnalysisPipelineDeps = {
  fetchPRFiles,
  fetchPRCommitMessages,
  buildContributorGraph,
  matchReviewers,
  generatePRContextBrief,
  postPRComment,
};

export async function runAnalysisPipeline(
  event: ParsedPREvent,
  githubToken: string | undefined,
  deps: AnalysisPipelineDeps = defaultPipelineDeps
): Promise<void> {
  console.log(`[analysis] Starting pipeline for PR #${event.prNumber} in ${event.repo}`);

  if (!githubToken) {
    console.warn('[analysis] GITHUB_TOKEN not set — skipping reviewer analysis');
    return;
  }

  // 1. Fetch changed files
  const prFiles = await deps.fetchPRFiles(event.owner, event.repoName, event.prNumber, githubToken);
  if (prFiles.length === 0) {
    console.log('[analysis] No files changed — skipping');
    return;
  }

  const filenames = prFiles.map((f) => f.filename);
  console.log(`[analysis] ${filenames.length} file(s) changed`);

  // 2. Build contributor graph from commit history for changed files
  const graph = await deps.buildContributorGraph(event.owner, event.repoName, filenames, githubToken);

  // 3. Match top reviewers (excluding PR author)
  const recommendations = deps.matchReviewers(graph, event.author);

  if (recommendations.length === 0) {
    console.log('[analysis] No reviewer candidates found');
    return;
  }

  // 4. Generate reviewer context briefs
  let commitMessages: string[] = [];
  try {
    commitMessages = await deps.fetchPRCommitMessages(event.owner, event.repoName, event.prNumber, githubToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[analysis] Unable to fetch PR commit messages; continuing without them: ${message}`);
  }

  const contextBrief = deps.generatePRContextBrief({
    prId: `${event.owner}/${event.repoName}#${event.prNumber}`,
    prTitle: event.title,
    files: prFiles,
    commitMessages,
    recommendations,
    contributorGraph: graph,
  });

  // 5. Format and post comment
  const comment = formatReviewerComment(event, recommendations, contextBrief.reviewerSections);
  await deps.postPRComment(event.owner, event.repoName, event.prNumber, comment, githubToken);
  console.log(`[analysis] Posted reviewer suggestions for PR #${event.prNumber}`);
}

function formatReviewerComment(
  event: ParsedPREvent,
  recommendations: ReviewerRecommendation[],
  reviewerSections: ReviewerContextSection[]
): string {
  const reviewerBriefByLogin = new Map(reviewerSections.map((section) => [section.login, section] as const));

  const lines: string[] = [
    '## PullMatch Reviewer Suggestions',
    '',
    `Analyzed **${event.title}** and found ${recommendations.length} suggested reviewer(s) based on code ownership, recent activity, and review context.`,
    '',
  ];

  for (const rec of recommendations) {
    const brief = reviewerBriefByLogin.get(rec.login);
    lines.push(`### @${rec.login} (score: ${rec.score})`);
    lines.push('Recommendation signals:');
    for (const reason of rec.reasons) {
      lines.push(`- ${reason}`);
    }
    if (brief) {
      lines.push('Context brief:');
      lines.push('Why this reviewer:');
      for (const reason of brief.whyPicked) {
        lines.push(`- ${reason}`);
      }
      lines.push('Focus areas:');
      for (const area of brief.focusAreas) {
        lines.push(`- ${area}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Powered by [PullMatch](https://github.com/pullmatch)_');

  return lines.join('\n');
}

export function createWebhookRouter(webhookSecret: string): Hono {
  const githubToken = process.env.GITHUB_TOKEN;
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
    };

    // Fire-and-forget: don't block webhook response on analysis
    runAnalysisPipeline(parsed, githubToken).catch((err) => {
      console.error(`[analysis] Pipeline error for PR #${parsed.prNumber}:`, err instanceof Error ? err.message : String(err));
    });
  });

  const router = new Hono();

  router.post('/webhook', async (c) => {
    const signature = c.req.header('X-Hub-Signature-256');
    const eventName = c.req.header('X-GitHub-Event');
    const deliveryId = c.req.header('X-GitHub-Delivery') ?? 'unknown';

    if (!signature) {
      return c.json({ error: 'Missing X-Hub-Signature-256 header' }, 400);
    }
    if (!eventName) {
      return c.json({ error: 'Missing X-GitHub-Event header' }, 400);
    }

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
      console.error('[webhook] Error processing event:', message);
      // Return 400 for signature failures, keeping 5xx for unexpected errors
      return c.json({ error: 'Webhook verification or processing failed' }, 400);
    }
  });

  return router;
}
