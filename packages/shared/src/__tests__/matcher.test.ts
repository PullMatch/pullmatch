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
  it('returns top 3 contributors by score', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 5, dirCommits: 0, latestCommit: recentDate },
      { login: 'bob', exactCommits: 3, dirCommits: 0, latestCommit: recentDate },
      { login: 'carol', exactCommits: 1, dirCommits: 0, latestCommit: recentDate },
      { login: 'dave', exactCommits: 0, dirCommits: 2, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results.length, 3);
    assert.equal(results[0].login, 'alice');
    assert.equal(results[1].login, 'bob');
    assert.equal(results[2].login, 'carol');
  });

  it('excludes the PR author', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 10, dirCommits: 0, latestCommit: recentDate },
      { login: 'bob', exactCommits: 3, dirCommits: 0, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'alice');
    assert.equal(results.length, 1);
    assert.equal(results[0].login, 'bob');
  });

  it('returns empty array when graph is empty', () => {
    const results = matchReviewers(new Map(), 'alice');
    assert.equal(results.length, 0);
  });

  it('ranks recent committers higher than stale ones with same commit count', () => {
    const graph = makeGraph([
      { login: 'stale', exactCommits: 3, dirCommits: 0, latestCommit: oldDate },
      { login: 'fresh', exactCommits: 3, dirCommits: 0, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results[0].login, 'fresh');
  });

  it('weights exact file commits higher than directory commits', () => {
    const graph = makeGraph([
      { login: 'dirOnly', exactCommits: 0, dirCommits: 10, latestCommit: recentDate },
      { login: 'exactOwner', exactCommits: 2, dirCommits: 0, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'other');
    // exactOwner: 2*3 + 0 + recency*2 = 6 + ~2 = ~8
    // dirOnly: 0 + 10*1 + recency*2 = 10 + ~2 = ~12... actually dirOnly wins here
    // Let's just check that exactOwner scores correctly with 1 exact commit
    const dirGraph = makeGraph([
      { login: 'dirOnly', exactCommits: 0, dirCommits: 2, latestCommit: recentDate },
      { login: 'exactOwner', exactCommits: 2, dirCommits: 0, latestCommit: recentDate },
    ]);
    const r = matchReviewers(dirGraph, 'other');
    // exactOwner: 2*3 + 0 + ~2 = 8; dirOnly: 0 + 2 + ~2 = 4 — exactOwner wins
    assert.equal(r[0].login, 'exactOwner');
  });

  it('uses alphabetical tie-breaking for determinism', () => {
    const graph = makeGraph([
      { login: 'zara', exactCommits: 2, dirCommits: 0, latestCommit: recentDate },
      { login: 'anna', exactCommits: 2, dirCommits: 0, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'other', 2);
    assert.equal(results[0].login, 'anna');
    assert.equal(results[1].login, 'zara');
  });

  it('includes reasons in recommendations', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 2, dirCommits: 1, latestCommit: recentDate },
    ]);
    const results = matchReviewers(graph, 'bob');
    assert.equal(results.length, 1);
    assert.ok(results[0].reasons.length >= 2);
    assert.ok(results[0].reasons[0].includes('2'));
  });
});
