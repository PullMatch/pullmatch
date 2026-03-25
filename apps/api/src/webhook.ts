import { Webhooks } from '@octokit/webhooks';
import { Hono } from 'hono';
import { fetchPRFiles, buildContributorGraph, matchReviewers, postPRComment } from '../../../packages/shared/src/index.ts';

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

async function runAnalysisPipeline(event: ParsedPREvent, githubToken: string | undefined): Promise<void> {
  console.log(`[analysis] Starting pipeline for PR #${event.prNumber} in ${event.repo}`);

  if (!githubToken) {
    console.warn('[analysis] GITHUB_TOKEN not set — skipping reviewer analysis');
    return;
  }

  // 1. Fetch changed files
  const prFiles = await fetchPRFiles(event.owner, event.repoName, event.prNumber, githubToken);
  if (prFiles.length === 0) {
    console.log('[analysis] No files changed — skipping');
    return;
  }

  const filenames = prFiles.map((f) => f.filename);
  console.log(`[analysis] ${filenames.length} file(s) changed`);

  // 2. Build contributor graph from commit history for changed files
  const graph = await buildContributorGraph(event.owner, event.repoName, filenames, githubToken);

  // 3. Match top reviewers (excluding PR author)
  const recommendations = matchReviewers(graph, event.author);

  if (recommendations.length === 0) {
    console.log('[analysis] No reviewer candidates found');
    return;
  }

  // 4. Format and post comment
  const comment = formatReviewerComment(event, recommendations);
  await postPRComment(event.owner, event.repoName, event.prNumber, comment, githubToken);
  console.log(`[analysis] Posted reviewer suggestions for PR #${event.prNumber}`);
}

function formatReviewerComment(
  event: ParsedPREvent,
  recommendations: Array<{ login: string; score: number; reasons: string[] }>
): string {
  const lines: string[] = [
    '## PullMatch Reviewer Suggestions',
    '',
    `Analyzed **${event.title}** and found ${recommendations.length} suggested reviewer(s) based on code ownership and recent activity.`,
    '',
  ];

  for (const rec of recommendations) {
    lines.push(`### @${rec.login} (score: ${rec.score})`);
    for (const reason of rec.reasons) {
      lines.push(`- ${reason}`);
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
