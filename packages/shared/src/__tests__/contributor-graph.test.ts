import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildContributorGraph } from '../contributor-graph.ts';

type FetchLike = typeof fetch;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('buildContributorGraph', () => {
  it('returns an empty map when no files are provided', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json([]);
    }) as FetchLike;

    const graph = await buildContributorGraph('acme', 'pullmatch', [], 'token');

    assert.equal(graph.size, 0);
    assert.equal(calls, 0);
  });

  it('aggregates exact and directory commits and tracks latest commit date', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('path=src%2Fapi%2Fwebhook.ts')) {
        return Response.json([
          { author: { login: 'alice' }, commit: { author: { date: '2026-03-15T00:00:00.000Z' } } },
        ]);
      }
      if (url.includes('path=src%2Fapi%2Frouter.ts')) {
        return Response.json([
          { author: { login: 'alice' }, commit: { author: { date: '2026-03-20T00:00:00.000Z' } } },
          { author: { login: 'bob' }, commit: { author: { date: '2026-03-19T00:00:00.000Z' } } },
        ]);
      }
      if (url.includes('path=src%2Fapi')) {
        return Response.json([
          { author: { login: 'alice' }, commit: { author: { date: '2026-03-18T00:00:00.000Z' } } },
          { author: { login: 'bob' }, commit: { author: { date: '2026-03-21T00:00:00.000Z' } } },
        ]);
      }

      return new Response(`Unhandled URL: ${url}`, { status: 500 });
    }) as FetchLike;

    const graph = await buildContributorGraph(
      'acme',
      'pullmatch',
      ['src/api/webhook.ts', 'src/api/router.ts'],
      'token'
    );

    assert.equal(graph.size, 2);
    assert.deepEqual(graph.get('alice'), {
      login: 'alice',
      exactCommits: 2,
      dirCommits: 1,
      latestCommit: '2026-03-20T00:00:00.000Z',
    });
    assert.deepEqual(graph.get('bob'), {
      login: 'bob',
      exactCommits: 1,
      dirCommits: 1,
      latestCommit: '2026-03-21T00:00:00.000Z',
    });
  });

  it('deduplicates directory lookups when multiple files share a directory', async () => {
    let dirCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('path=src%2Fservice%2Fa.ts') || url.includes('path=src%2Fservice%2Fb.ts')) {
        return Response.json([]);
      }
      if (url.includes('path=src%2Fservice')) {
        dirCalls += 1;
        return Response.json([
          { author: { login: 'owner' }, commit: { author: { date: '2026-03-22T00:00:00.000Z' } } },
        ]);
      }

      return new Response(`Unhandled URL: ${url}`, { status: 500 });
    }) as FetchLike;

    const graph = await buildContributorGraph('acme', 'pullmatch', ['src/service/a.ts', 'src/service/b.ts'], 'token');

    assert.equal(dirCalls, 1);
    assert.deepEqual(graph.get('owner'), {
      login: 'owner',
      exactCommits: 0,
      dirCommits: 1,
      latestCommit: '2026-03-22T00:00:00.000Z',
    });
  });

  it('excludes bot accounts from exact and directory results', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('path=src%2Fcore%2Fmain.ts')) {
        return Response.json([
          { author: { login: 'dependabot[bot]' }, commit: { author: { date: '2026-03-20T00:00:00.000Z' } } },
          { author: { login: 'bot-release' }, commit: { author: { date: '2026-03-20T00:00:00.000Z' } } },
          { author: { login: 'human' }, commit: { author: { date: '2026-03-19T00:00:00.000Z' } } },
        ]);
      }
      if (url.includes('path=src%2Fcore')) {
        return Response.json([
          { author: { login: 'human' }, commit: { author: { date: '2026-03-21T00:00:00.000Z' } } },
        ]);
      }

      return new Response(`Unhandled URL: ${url}`, { status: 500 });
    }) as FetchLike;

    const graph = await buildContributorGraph('acme', 'pullmatch', ['src/core/main.ts'], 'token');

    assert.equal(graph.size, 1);
    assert.deepEqual(graph.get('human'), {
      login: 'human',
      exactCommits: 1,
      dirCommits: 1,
      latestCommit: '2026-03-21T00:00:00.000Z',
    });
  });

  it('handles a single file with multiple committers', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('path=src%2Fworker.ts')) {
        return Response.json([
          { author: { login: 'alice' }, commit: { author: { date: '2026-03-10T00:00:00.000Z' } } },
          { author: { login: 'bob' }, commit: { author: { date: '2026-03-11T00:00:00.000Z' } } },
          { author: { login: 'carol' }, commit: { author: { date: '2026-03-12T00:00:00.000Z' } } },
        ]);
      }
      if (url.includes('path=src')) {
        return Response.json([]);
      }

      return new Response(`Unhandled URL: ${url}`, { status: 500 });
    }) as FetchLike;

    const graph = await buildContributorGraph('acme', 'pullmatch', ['src/worker.ts'], 'token');

    assert.equal(graph.size, 3);
    assert.equal(graph.get('alice')?.exactCommits, 1);
    assert.equal(graph.get('bob')?.exactCommits, 1);
    assert.equal(graph.get('carol')?.exactCommits, 1);
  });
});
