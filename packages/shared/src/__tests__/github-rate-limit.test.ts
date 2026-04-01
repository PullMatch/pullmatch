import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fetchPRFiles, getLatestRateLimitStatus, GitHubRateLimitError } from '../github.ts';

type FetchLike = typeof fetch;

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  globalThis.setTimeout = ((handler: (...args: unknown[]) => void) => {
    handler();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

describe('GitHub API resilience', () => {
  it('retries transient 5xx errors with exponential backoff', async () => {
    let calls = 0;
    const delays: number[] = [];

    globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number) => {
      delays.push(timeout ?? 0);
      handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 3) {
        return new Response('temporary failure', { status: 502 });
      }
      return Response.json([{ filename: 'src/index.ts', status: 'modified' }]);
    }) as FetchLike;

    const files = await fetchPRFiles('acme', 'repo', 1, 'token');
    assert.equal(files.length, 1);
    assert.equal(calls, 3);
    assert.deepEqual(delays.filter((delay) => delay < 30_000), [500, 1000]);
  });

  it('does not retry non-rate-limit 4xx errors', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response('missing', { status: 404 });
    }) as FetchLike;

    await assert.rejects(() => fetchPRFiles('acme', 'repo', 1, 'token'), /GitHub API error 404/);
    assert.equal(calls, 1);
  });

  it('captures low rate limit headers for status reporting', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify([{ filename: 'src/index.ts', status: 'modified' }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Remaining': '5',
          'X-RateLimit-Reset': '1900000000',
        },
      });
    }) as FetchLike;

    await fetchPRFiles('acme', 'repo', 1, 'token');
    const status = getLatestRateLimitStatus();
    assert.ok(status);
    assert.equal(status?.isLow, true);
    assert.equal(status?.remaining, 5);
    assert.equal(status?.limit, 5000);
  });

  it('throws GitHubRateLimitError on 403 with remaining=0', async () => {
    globalThis.fetch = (async () => {
      return new Response('rate limited', {
        status: 403,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1900000000',
        },
      });
    }) as FetchLike;

    await assert.rejects(
      () => fetchPRFiles('acme', 'repo', 1, 'token'),
      (err: unknown) => err instanceof GitHubRateLimitError
    );
  });
});
