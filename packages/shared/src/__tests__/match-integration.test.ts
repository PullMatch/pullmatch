/**
 * Integration test: verifies /api/match pipeline uses real GitHub API.
 *
 * Skipped automatically when GITHUB_TOKEN_WRITE is not set.
 * WILL FAIL if the GitHub API fetch calls are removed or replaced with mocks.
 *
 * Run with:
 *   GITHUB_TOKEN_WRITE=<token> node --experimental-strip-types --test \
 *     src/__tests__/match-integration.test.ts
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPRFiles, buildContributorGraph, matchReviewers } from '../index.ts';

const TOKEN  = process.env.GITHUB_TOKEN_WRITE;
const OWNER  = 'microsoft';
const REPO   = 'vscode';
const PR_NUM = 304772; // closed PR with known file changes

// Spy: count how many real fetch calls happen
let fetchCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (...args) {
  const url = String(args[0]);
  if (url.includes('api.github.com')) fetchCallCount++;
  return originalFetch.apply(this, args);
} as typeof fetch;

describe('match-integration (live GitHub API)', { skip: !TOKEN }, () => {
  let files: Awaited<ReturnType<typeof fetchPRFiles>>;

  before(async () => {
    files = await fetchPRFiles(OWNER, REPO, PR_NUM, TOKEN);
  });

  it('fetchPRFiles returns at least 1 real file from GitHub', () => {
    assert.ok(files.length >= 1, `Expected >=1 file, got ${files.length}`);
    assert.ok(typeof files[0].filename === 'string');
  });

  it('buildContributorGraph returns non-empty graph', async () => {
    const filenames = files.map((f) => f.filename);
    const graph = await buildContributorGraph(OWNER, REPO, filenames, TOKEN);
    assert.ok(graph.size >= 1, `Expected >=1 contributor, got ${graph.size}`);
  });

  it('matchReviewers returns at least 3 reviewers with reasons', async () => {
    const filenames = files.map((f) => f.filename);
    const graph = await buildContributorGraph(OWNER, REPO, filenames, TOKEN);
    const reviewers = matchReviewers(graph, '', 3);
    assert.ok(reviewers.length >= 3 || graph.size < 3,
      `Expected >=3 reviewers (or fewer if repo has fewer contributors), got ${reviewers.length}`);
    for (const r of reviewers) {
      assert.ok(r.reasons.length >= 1, `Reviewer ${r.login} has no reasons`);
    }
  });

  it('made real GitHub API calls (not mocked)', () => {
    assert.ok(fetchCallCount >= 2,
      `Expected >=2 real GitHub API calls but got ${fetchCallCount} — API may be mocked`);
  });
});
