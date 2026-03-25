import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchReviewers } from '../matcher.ts';
import type { ContributorEntry } from '../contributor-graph.ts';

function makeGraph(entries: ContributorEntry[]): Map<string, ContributorEntry> {
  const m = new Map<string, ContributorEntry>();
  for (const e of entries) m.set(e.login, e);
  return m;
}

const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days ago

describe('matchReviewers', () => {
  it('returns top 2 contributors by score', () => {
    const graph = makeGraph([
      { login: 'alice', fileCount: 5, latestCommit: recentDate },
      { login: 'bob', fileCount: 3, latestCommit: recentDate },
      { login: 'carol', fileCount: 1, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results.length, 2);
    assert.equal(results[0].login, 'alice');
    assert.equal(results[1].login, 'bob');
  });

  it('excludes the PR author', () => {
    const graph = makeGraph([
      { login: 'alice', fileCount: 10, latestCommit: recentDate },
      { login: 'bob', fileCount: 3, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'alice');
    assert.equal(results.length, 1);
    assert.equal(results[0].login, 'bob');
  });

  it('returns empty array when graph is empty', () => {
    const results = matchReviewers(new Map(), 'alice');
    assert.equal(results.length, 0);
  });

  it('ranks recent committers higher than stale ones with same file count', () => {
    const graph = makeGraph([
      { login: 'stale', fileCount: 3, latestCommit: oldDate },
      { login: 'fresh', fileCount: 3, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results[0].login, 'fresh');
  });

  it('includes reasons in recommendations', () => {
    const graph = makeGraph([
      { login: 'alice', fileCount: 2, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'bob');
    assert.equal(results.length, 1);
    assert.ok(results[0].reasons.length > 0);
    assert.ok(results[0].reasons[0].includes('2'));
  });
});
