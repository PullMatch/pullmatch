import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Webhooks } from '@octokit/webhooks';
import { createWebhookRouter } from '../webhook.ts';

type FetchLike = typeof fetch;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GITHUB_TOKEN_WRITE;
});

function makePullRequestPayload(action: 'opened' | 'synchronize' = 'opened') {
  return {
    action,
    number: 42,
    pull_request: {
      title: 'Improve reviewer matching',
      user: { login: 'author-user' },
      head: { ref: 'feature/reviewers', sha: 'abc123' },
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

async function sendWebhookRequest(params: {
  secret: string;
  eventName: string;
  payload: string;
  includeSignature?: boolean;
}) {
  const { secret, eventName, payload, includeSignature = true } = params;
  const signature = includeSignature ? await signPayload(secret, payload) : undefined;
  const router = createWebhookRouter(secret);

  return router.request('http://localhost/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(includeSignature ? { 'x-hub-signature-256': signature! } : {}),
      'x-github-event': eventName,
      'x-github-delivery': 'delivery-1',
    },
    body: payload,
  });
}

async function waitFor(check: () => boolean, timeoutMs = 1_500): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for async webhook pipeline');
}

describe('createWebhookRouter', () => {
  it('returns 400 when signature header is missing', async () => {
    const payload = JSON.stringify(makePullRequestPayload());
    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
      includeSignature: false,
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body, { error: 'Missing X-Hub-Signature-256 header' });
  });

  it('returns 200 for non-PR events and does not run analysis', async () => {
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return new Response('unexpected call', { status: 500 });
    }) as FetchLike;

    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'ping',
      payload: JSON.stringify({ zen: 'Keep it logically awesome.' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(fetchCalls.length, 0);
  });

  it('handles invalid signatures as a 400 response', async () => {
    const secret = 'test-secret';
    const payload = JSON.stringify(makePullRequestPayload());
    const router = createWebhookRouter(secret);

    const response = await router.request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-invalid',
      },
      body: payload,
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Webhook verification or processing failed' });
  });

  it('processes pull_request.opened and posts reviewer suggestions', async () => {
    process.env.GITHUB_TOKEN_WRITE = 'token-for-tests';
    const payload = JSON.stringify(makePullRequestPayload('opened'));

    let commentBody: string | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

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
      if (url.includes('/issues/42/comments') && init?.method === 'POST') {
        const parsed = JSON.parse(String(init.body)) as { body: string };
        commentBody = parsed.body;
        return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
      }

      return new Response(`Unexpected URL in test: ${url}`, { status: 500 });
    }) as FetchLike;

    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });

    await waitFor(() => commentBody !== null);
    assert.ok(commentBody!.includes('## PullMatch Reviewer Suggestions'));
    assert.ok(commentBody!.includes('### @alice'));
    assert.ok(commentBody!.includes('_Powered by [PullMatch](https://github.com/pullmatch)_'));
  });
});
