import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { findExistingComment, updatePRComment, PULLMATCH_MARKER } from '../github.ts';

type FetchLike = typeof fetch;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('PULLMATCH_MARKER', () => {
  it('is an HTML comment', () => {
    assert.ok(PULLMATCH_MARKER.startsWith('<!--'));
    assert.ok(PULLMATCH_MARKER.endsWith('-->'));
  });
});

describe('findExistingComment', () => {
  it('returns comment id when marker is present', async () => {
    globalThis.fetch = (async () => {
      return Response.json([
        { id: 1, body: 'Some other comment' },
        { id: 42, body: `${PULLMATCH_MARKER}\n## PullMatch Reviewer Suggestions` },
      ]);
    }) as FetchLike;

    const id = await findExistingComment('acme', 'repo', 1, 'token');
    assert.equal(id, 42);
  });

  it('returns null when no marker comment exists', async () => {
    globalThis.fetch = (async () => {
      return Response.json([
        { id: 1, body: 'Unrelated comment' },
      ]);
    }) as FetchLike;

    const id = await findExistingComment('acme', 'repo', 1, 'token');
    assert.equal(id, null);
  });

  it('returns null for empty comment list', async () => {
    globalThis.fetch = (async () => {
      return Response.json([]);
    }) as FetchLike;

    const id = await findExistingComment('acme', 'repo', 1, 'token');
    assert.equal(id, null);
  });

  it('throws on API error', async () => {
    globalThis.fetch = (async () => {
      return new Response('Not Found', { status: 404 });
    }) as FetchLike;

    await assert.rejects(
      () => findExistingComment('acme', 'repo', 1, 'token'),
      /GitHub API error 404/
    );
  });
});

describe('updatePRComment', () => {
  it('sends PATCH request with updated body', async () => {
    let patchUrl = '';
    let patchBody = '';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      patchUrl = String(input);
      patchBody = String(init?.body);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as FetchLike;

    await updatePRComment('acme', 'repo', 42, 'updated body', 'token');
    assert.ok(patchUrl.includes('/repos/acme/repo/issues/comments/42'));
    assert.deepEqual(JSON.parse(patchBody), { body: 'updated body' });
  });

  it('throws on API error', async () => {
    globalThis.fetch = (async () => {
      return new Response('Forbidden', { status: 403 });
    }) as FetchLike;

    await assert.rejects(
      () => updatePRComment('acme', 'repo', 42, 'body', 'token'),
      /GitHub API error 403/
    );
  });
});
