import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Webhooks } from '@octokit/webhooks';
import { createWebhookRouter, resetWebhookStateForTests } from '../webhook.ts';
import { clearReviewStore, getOutcomesForPR, getReviewStats } from '@pullmatch/shared';

type FetchLike = typeof fetch;

const originalFetch = globalThis.fetch;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  delete process.env.GITHUB_TOKEN_WRITE;
  clearReviewStore();
  resetWebhookStateForTests();
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

function makeInstallationPayload(action: 'created' | 'deleted') {
  return {
    action,
    installation: {
      id: 1001,
      account: { login: 'acme' },
    },
    sender: { login: 'installer-user' },
    repositories: [{ full_name: 'acme/pullmatch' }, { full_name: 'acme/shared' }],
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
      'x-github-delivery': `delivery-${eventName}`,
    },
    body: payload,
  });
}

async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for async webhook pipeline');
}

describe('webhook integration pipeline', () => {
  it('validates signature headers (missing and invalid)', async () => {
    const payload = JSON.stringify(makePullRequestPayload());

    const missingHeader = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
      includeSignature: false,
    });

    assert.equal(missingHeader.status, 400);
    assert.deepEqual(await missingHeader.json(), { error: 'Missing X-Hub-Signature-256 header' });

    const router = createWebhookRouter('test-secret');
    const invalidSignature = await router.request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-invalid',
      },
      body: payload,
    });

    assert.equal(invalidSignature.status, 400);
    assert.deepEqual(await invalidSignature.json(), { error: 'Webhook verification or processing failed' });
  });

  it('runs full PR pipeline with default config and posts a reviewer comment', async () => {
    process.env.GITHUB_TOKEN_WRITE = 'token-for-tests';
    const payload = JSON.stringify(makePullRequestPayload('opened'));

    let commentBody: string | null = null;
    let reviewerRequestCalled = false;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/contents/.pullmatch.yml')) {
        return new Response('Not Found', { status: 404 });
      }
      if (url.includes('/pulls/42/files')) {
        return Response.json([{ filename: 'src/matcher.ts', status: 'modified' }]);
      }
      if (url.includes('/pulls/42/commits')) {
        return Response.json([{ commit: { message: 'fix(api): guard null reviewer candidate' } }]);
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
      if (url.includes('/issues/42/comments') && (!init?.method || init?.method === 'GET')) {
        return Response.json([]);
      }
      if (url.includes('/issues/42/comments') && init?.method === 'POST') {
        const parsed = JSON.parse(String(init.body)) as { body: string };
        commentBody = parsed.body;
        return Response.json({ id: 1 }, { status: 201 });
      }
      if (url.includes('/requested_reviewers') && init?.method === 'POST') {
        reviewerRequestCalled = true;
        return Response.json({ requested_reviewers: [] }, { status: 201 });
      }

      return new Response(`Unexpected URL in integration test: ${url}`, { status: 500 });
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
    assert.ok(commentBody!.includes('> **Context:**'));
    assert.equal(reviewerRequestCalled, false);
  });

  it('loads custom .pullmatch.yml and auto-assigns top reviewers when enabled', async () => {
    process.env.GITHUB_TOKEN_WRITE = 'token-for-tests';
    const payload = JSON.stringify(makePullRequestPayload('synchronize'));

    let postedComment: string | null = null;
    let requestedReviewersPayload: { reviewers: string[] } | null = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/contents/.pullmatch.yml')) {
        return new Response(
          [
            'reviewers:',
            '  count: 2',
            '  autoAssign: true',
            '  autoAssignCount: 1',
            '  exclude:',
            '    - author-user',
            'ignore:',
            '  - "docs/**"',
          ].join('\n'),
          { status: 200 }
        );
      }
      if (url.includes('/pulls/42/files')) {
        return Response.json([
          { filename: 'src/matcher.ts', status: 'modified' },
          { filename: 'docs/changelog.md', status: 'modified' },
        ]);
      }
      if (url.includes('/pulls/42/commits')) {
        return Response.json([{ commit: { message: 'feat(api): improve config-driven reviewer matching' } }]);
      }
      if (url.includes('/commits?path=src%2Fmatcher.ts')) {
        return Response.json([
          { author: { login: 'carol' }, commit: { author: { date: '2026-03-25T00:00:00.000Z' } } },
        ]);
      }
      if (url.includes('/commits?path=src')) {
        return Response.json([
          { author: { login: 'carol' }, commit: { author: { date: '2026-03-26T00:00:00.000Z' } } },
        ]);
      }
      if (url.includes('/issues/42/comments') && (!init?.method || init?.method === 'GET')) {
        return Response.json([]);
      }
      if (url.includes('/issues/42/comments') && init?.method === 'POST') {
        postedComment = (JSON.parse(String(init.body)) as { body: string }).body;
        return Response.json({ id: 2 }, { status: 201 });
      }
      if (url.includes('/requested_reviewers') && init?.method === 'POST') {
        requestedReviewersPayload = JSON.parse(String(init.body)) as { reviewers: string[] };
        return Response.json({ requested_reviewers: [{ login: 'carol' }] }, { status: 201 });
      }

      return new Response(`Unexpected URL in integration test: ${url}`, { status: 500 });
    }) as FetchLike;

    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });

    await waitFor(() => postedComment !== null && requestedReviewersPayload !== null);
    assert.ok(postedComment!.includes('### @carol'));
    assert.deepEqual(requestedReviewersPayload, { reviewers: ['carol'] });
  });

  it('handles installation created/deleted events and emits analytics records', async () => {
    const analyticsLogs: string[] = [];
    console.log = ((line?: unknown) => {
      analyticsLogs.push(String(line));
    }) as typeof console.log;

    const createdResponse = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'installation',
      payload: JSON.stringify(makeInstallationPayload('created')),
    });
    const deletedResponse = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'installation',
      payload: JSON.stringify(makeInstallationPayload('deleted')),
    });

    assert.equal(createdResponse.status, 200);
    assert.equal(deletedResponse.status, 200);

    await waitFor(() => analyticsLogs.filter((entry) => entry.includes('"type":"analytics"')).length >= 2);
    const parsed = analyticsLogs
      .filter((entry) => entry.includes('"type":"analytics"'))
      .map((entry) => JSON.parse(entry) as { name: string; properties: Record<string, unknown> });

    assert.equal(parsed[0].name, 'installation_event');
    assert.equal(parsed[0].properties.action, 'created');
    assert.equal(parsed[0].properties.org, 'acme');
    assert.equal(parsed[0].properties.repoCount, 2);

    assert.equal(parsed[1].name, 'installation_event');
    assert.equal(parsed[1].properties.action, 'deleted');
    assert.equal(parsed[1].properties.org, 'acme');
    assert.equal(parsed[1].properties.repoCount, 2);
  });

  it('handles no-token, rate-limit, and network-timeout error scenarios without failing webhook response', async () => {
    const payload = JSON.stringify(makePullRequestPayload());

    let fetchCallsNoToken = 0;
    globalThis.fetch = (async () => {
      fetchCallsNoToken += 1;
      return new Response('unexpected', { status: 500 });
    }) as FetchLike;

    const noTokenResponse = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
    });

    assert.equal(noTokenResponse.status, 200);
    assert.equal(fetchCallsNoToken, 0);

    process.env.GITHUB_TOKEN_WRITE = 'token-for-tests';

    let rateLimitCommentBody: string | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/contents/.pullmatch.yml')) return new Response('Not Found', { status: 404 });
      if (url.includes('/pulls/42/files')) return new Response('rate limited', { status: 429 });
      if (url.includes('/issues/42/comments') && init?.method === 'POST') {
        rateLimitCommentBody = (JSON.parse(String(init.body)) as { body: string }).body;
        return new Response('{}', { status: 201 });
      }
      return new Response('{}', { status: 200 });
    }) as FetchLike;

    const rateLimitResponse = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
    });

    assert.equal(rateLimitResponse.status, 200);
    await waitFor(() => rateLimitCommentBody !== null);
    assert.ok(rateLimitCommentBody!.includes('encountered an error analyzing this PR'));

    let timeoutCommentBody: string | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/contents/.pullmatch.yml')) return new Response('Not Found', { status: 404 });
      if (url.includes('/pulls/42/files')) throw new Error('network timeout');
      if (url.includes('/issues/42/comments') && init?.method === 'POST') {
        timeoutCommentBody = (JSON.parse(String(init.body)) as { body: string }).body;
        return new Response('{}', { status: 201 });
      }
      return new Response('{}', { status: 200 });
    }) as FetchLike;

    const timeoutResponse = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request',
      payload,
    });

    assert.equal(timeoutResponse.status, 200);
    await waitFor(() => timeoutCommentBody !== null);
    assert.ok(timeoutCommentBody!.includes('encountered an error analyzing this PR'));
  });
});

function makePullRequestReviewPayload(
  action: 'submitted' | 'dismissed',
  state: 'approved' | 'changes_requested' | 'commented' = 'approved'
) {
  return {
    action,
    review: {
      user: { login: 'reviewer-alice' },
      state: action === 'dismissed' ? 'dismissed' : state,
      submitted_at: '2026-03-30T12:00:00Z',
    },
    pull_request: {
      number: 42,
      title: 'Improve reviewer matching',
      user: { login: 'author-user' },
      head: { ref: 'feature/reviewers', sha: 'abc123' },
      base: { ref: 'main' },
    },
    repository: {
      full_name: 'acme/pullmatch',
      name: 'pullmatch',
      owner: { login: 'acme' },
    },
  };
}

describe('pull_request_review webhook', () => {
  it('records approved review and emits review_completed event', async () => {
    const analyticsLogs: string[] = [];
    console.log = ((line?: unknown) => {
      analyticsLogs.push(String(line));
    }) as typeof console.log;

    const payload = JSON.stringify(makePullRequestReviewPayload('submitted', 'approved'));
    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request_review',
      payload,
    });

    assert.equal(response.status, 200);

    await waitFor(() => analyticsLogs.some((l) => l.includes('"review_completed"')));

    const outcomes = getOutcomesForPR('acme/pullmatch', 42);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].reviewer, 'reviewer-alice');
    assert.equal(outcomes[0].action, 'approved');
    assert.equal(outcomes[0].timestamp, '2026-03-30T12:00:00Z');

    const event = analyticsLogs
      .filter((l) => l.includes('"review_completed"'))
      .map((l) => JSON.parse(l) as { name: string; properties: Record<string, unknown> })[0];
    assert.equal(event.properties.reviewer, 'reviewer-alice');
    assert.equal(event.properties.action, 'approved');
    assert.equal(event.properties.pr_number, 42);
    assert.equal(event.properties.repo, 'acme/pullmatch');
  });

  it('records changes_requested review', async () => {
    console.log = (() => {}) as typeof console.log;

    const payload = JSON.stringify(makePullRequestReviewPayload('submitted', 'changes_requested'));
    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request_review',
      payload,
    });

    assert.equal(response.status, 200);
    await waitFor(() => getOutcomesForPR('acme/pullmatch', 42).length > 0);

    const outcomes = getOutcomesForPR('acme/pullmatch', 42);
    assert.equal(outcomes[0].action, 'changes_requested');
  });

  it('records dismissed review', async () => {
    console.log = (() => {}) as typeof console.log;

    const payload = JSON.stringify(makePullRequestReviewPayload('dismissed'));
    const response = await sendWebhookRequest({
      secret: 'test-secret',
      eventName: 'pull_request_review',
      payload,
    });

    assert.equal(response.status, 200);
    await waitFor(() => getOutcomesForPR('acme/pullmatch', 42).length > 0);

    const outcomes = getOutcomesForPR('acme/pullmatch', 42);
    assert.equal(outcomes[0].action, 'dismissed');
  });

  it('accumulates stats across multiple reviews', async () => {
    console.log = (() => {}) as typeof console.log;

    const approved = JSON.stringify(makePullRequestReviewPayload('submitted', 'approved'));
    const changesRequested = JSON.stringify(makePullRequestReviewPayload('submitted', 'changes_requested'));

    await sendWebhookRequest({ secret: 'test-secret', eventName: 'pull_request_review', payload: approved });
    await waitFor(() => getOutcomesForPR('acme/pullmatch', 42).length > 0);

    await sendWebhookRequest({ secret: 'test-secret', eventName: 'pull_request_review', payload: changesRequested });
    await waitFor(() => getOutcomesForPR('acme/pullmatch', 42).length > 1);

    const stats = getReviewStats('acme/pullmatch');
    const aliceStats = stats.get('reviewer-alice');
    assert.ok(aliceStats);
    assert.equal(aliceStats.total, 2);
    assert.equal(aliceStats.approved, 1);
    assert.equal(aliceStats.changesRequested, 1);
    assert.equal(aliceStats.approvalRate, 0.5);
  });
});
