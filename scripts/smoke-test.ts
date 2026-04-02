import { serve } from '@hono/node-server';
import { Webhooks } from '@octokit/webhooks';
import { Hono } from 'hono';
import { PULLMATCH_MARKER } from '@pullmatch/shared';
import { createWebhookRouter } from '../apps/api/src/webhook.ts';

type FetchLike = typeof fetch;

type PullRequestPayload = {
  action: 'opened';
  number: number;
  pull_request: {
    title: string;
    user: { login: string };
    head: { ref: string; sha: string };
    base: { ref: string };
    diff_url: string;
    html_url: string;
  };
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
  };
};

function makePullRequestPayload(): PullRequestPayload {
  return {
    action: 'opened',
    number: 42,
    pull_request: {
      title: 'Smoke test reviewer matching',
      user: { login: 'author-user' },
      head: { ref: 'feature/smoke', sha: 'abc123' },
      base: { ref: 'main' },
      diff_url: 'https://example.test/diff',
      html_url: 'https://example.test/pull/42',
    },
    repository: {
      full_name: 'acme/pullmatch',
      name: 'pullmatch',
      owner: { login: 'acme' },
    },
  };
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const signer = new Webhooks({ secret });
  return signer.sign(payload);
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for reviewer comment post');
}

async function main(): Promise<void> {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? 'smoke-test-secret';
  process.env.GITHUB_TOKEN_WRITE = process.env.GITHUB_TOKEN_WRITE ?? 'token-for-smoke';

  const app = new Hono();
  app.route('/', createWebhookRouter(webhookSecret));

  const server = serve({ fetch: app.fetch, port: 0 });
  const originalFetch = globalThis.fetch;

  let postedCommentBody: string | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/contents/.pullmatch.yml')) {
      return new Response('Not Found', { status: 404 });
    }
    if (url.includes('/pulls/42/files')) {
      return Response.json([{ filename: 'src/matcher.ts', status: 'modified' }]);
    }
    if (url.includes('/commits?path=src%2Fmatcher.ts')) {
      return Response.json([
        { author: { login: 'alice' }, commit: { author: { date: '2026-03-20T00:00:00.000Z' } } },
      ]);
    }
    if (url.includes('/commits?path=src')) {
      return Response.json([
        { author: { login: 'alice' }, commit: { author: { date: '2026-03-21T00:00:00.000Z' } } },
      ]);
    }
    if (url.includes('/issues/42/comments') && (!init?.method || init.method === 'GET')) {
      return Response.json([]);
    }
    if (url.includes('/issues/42/comments') && init?.method === 'POST') {
      postedCommentBody = (JSON.parse(String(init.body)) as { body: string }).body;
      return Response.json({ id: 1 }, { status: 201 });
    }

    return new Response(`Unexpected URL in smoke test: ${url}`, { status: 500 });
  }) as FetchLike;

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind local server on an ephemeral port');
    }

    const payload = JSON.stringify(makePullRequestPayload());
    const signature = await signPayload(webhookSecret, payload);

    const response = await originalFetch(`http://127.0.0.1:${address.port}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature,
        'x-github-event': 'pull_request',
        'x-github-delivery': 'smoke-delivery-1',
      },
      body: payload,
    });

    if (response.status !== 200) {
      throw new Error(`Expected webhook response status 200, got ${response.status}`);
    }

    const body = (await response.json()) as { ok?: boolean };
    if (body.ok !== true) {
      throw new Error(`Expected webhook response body { ok: true }, got ${JSON.stringify(body)}`);
    }

    await waitFor(() => postedCommentBody !== null);

    if (!postedCommentBody?.includes(PULLMATCH_MARKER)) {
      throw new Error('Posted comment is missing PullMatch marker');
    }
    if (!postedCommentBody.includes('## PullMatch Reviewer Suggestions')) {
      throw new Error('Posted comment is missing reviewer suggestions header');
    }
    if (!postedCommentBody.includes('### @alice')) {
      throw new Error('Posted comment is missing expected reviewer suggestion format');
    }

    console.log('Smoke test passed: webhook endpoint returned 200 and reviewer suggestions were generated.');
    process.exit(0);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke test failed: ${message}`);
  process.exit(1);
});
