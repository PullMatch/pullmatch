import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requestReviewers } from '../github.ts';

// Mock fetch globally
let fetchMock: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (url: string | URL | Request, init?: RequestInit) => fetchMock(url, init);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('requestReviewers', () => {
  it('returns empty result for empty logins array', async () => {
    const result = await requestReviewers('owner', 'repo', 1, [], 'token');
    assert.deepStrictEqual(result, { requested: [], failed: [] });
  });

  it('sends POST to correct endpoint with reviewer logins', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    fetchMock = async (url, init) => {
      capturedUrl = url as string;
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({
        requested_reviewers: [{ login: 'alice' }, { login: 'bob' }],
      }), { status: 200 });
    };

    const result = await requestReviewers('myorg', 'myrepo', 42, ['alice', 'bob'], 'test-token');

    assert.ok(capturedUrl.includes('/repos/myorg/myrepo/pulls/42/requested_reviewers'));
    assert.deepStrictEqual(JSON.parse(capturedBody), { reviewers: ['alice', 'bob'] });
    assert.deepStrictEqual(result.requested, ['alice', 'bob']);
    assert.deepStrictEqual(result.failed, []);
  });

  it('reports failed reviewers when not in response', async () => {
    fetchMock = async () => {
      return new Response(JSON.stringify({
        requested_reviewers: [{ login: 'alice' }],
      }), { status: 200 });
    };

    const result = await requestReviewers('owner', 'repo', 1, ['alice', 'bob'], 'token');
    assert.deepStrictEqual(result.requested, ['alice']);
    assert.deepStrictEqual(result.failed, ['bob']);
  });

  it('handles 422 gracefully (non-collaborator)', async () => {
    fetchMock = async () => {
      return new Response('{"message": "Reviews may only be requested from collaborators"}', {
        status: 422,
      });
    };

    const result = await requestReviewers('owner', 'repo', 1, ['stranger'], 'token');
    assert.deepStrictEqual(result.requested, []);
    assert.deepStrictEqual(result.failed, ['stranger']);
  });

  it('throws on non-422 error responses', async () => {
    fetchMock = async () => {
      return new Response('Internal Server Error', { status: 500 });
    };

    await assert.rejects(
      () => requestReviewers('owner', 'repo', 1, ['alice'], 'token'),
      (err: Error) => {
        assert.ok(err.message.includes('500'));
        return true;
      }
    );
  });

  it('includes authorization header', async () => {
    let capturedHeaders: HeadersInit | undefined;

    fetchMock = async (_url, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ requested_reviewers: [] }), { status: 200 });
    };

    await requestReviewers('owner', 'repo', 1, ['alice'], 'my-secret-token');

    const h = capturedHeaders as Record<string, string>;
    assert.equal(h['Authorization'], 'Bearer my-secret-token');
  });
});
