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

function entry(overrides: Partial<ContributorEntry> & { login: string; exactCommits: number; dirCommits: number; latestCommit: string }): ContributorEntry {
  return { isCodeOwner: false, codeOwnerFiles: 0, ...overrides };
}

describe('matchReviewers', () => {
  it('returns top 3 contributors by score', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 5, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'bob', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'carol', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'dave', exactCommits: 0, dirCommits: 2, latestCommit: recentDate }),
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results.length, 3);
    assert.equal(results[0].login, 'alice');
    assert.equal(results[1].login, 'bob');
    assert.equal(results[2].login, 'carol');
  });

  it('excludes the PR author', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 10, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'bob', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
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
      entry({ login: 'stale', exactCommits: 3, dirCommits: 0, latestCommit: oldDate }),
      entry({ login: 'fresh', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results[0].login, 'fresh');
  });

  it('weights exact file commits higher than directory commits', () => {
    const dirGraph = makeGraph([
      entry({ login: 'dirOnly', exactCommits: 0, dirCommits: 2, latestCommit: recentDate }),
      entry({ login: 'exactOwner', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const r = matchReviewers(dirGraph, 'other');
    // exactOwner: 2*3 + 0 + ~2 = 8; dirOnly: 0 + 2 + ~2 = 4 — exactOwner wins
    assert.equal(r[0].login, 'exactOwner');
  });

  it('uses alphabetical tie-breaking for determinism', () => {
    const graph = makeGraph([
      entry({ login: 'zara', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'anna', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const results = matchReviewers(graph, 'other', 2);
    assert.equal(results[0].login, 'anna');
    assert.equal(results[1].login, 'zara');
  });

  it('includes reasons in recommendations', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 2, dirCommits: 1, latestCommit: recentDate }),
    ]);
    const results = matchReviewers(graph, 'bob');
    assert.equal(results.length, 1);
    assert.ok(results[0].reasons.length >= 2);
    assert.ok(results[0].reasons[0].includes('2'));
  });

  it('boosts code owners above commit-only candidates', () => {
    const graph = makeGraph([
      entry({ login: 'committer', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'owner', exactCommits: 1, dirCommits: 0, latestCommit: recentDate, isCodeOwner: true, codeOwnerFiles: 2 }),
    ]);
    const results = matchReviewers(graph, 'other', 2);
    // owner: 1*3 + 0 + ~2 + 2*4 = 3 + ~2 + 8 = ~13
    // committer: 3*3 + 0 + ~2 = 9 + ~2 = ~11
    assert.equal(results[0].login, 'owner');
    assert.ok(results[0].reasons.some((r) => r.includes('code owner')));
  });

  it('code owner reason shows file count', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate, isCodeOwner: true, codeOwnerFiles: 3 }),
    ]);
    const results = matchReviewers(graph, 'bob');
    assert.ok(results[0].reasons.some((r) => r.includes('3 changed file(s)')));
  });

  it('penalizes overloaded reviewers when load balancing is enabled', () => {
    const graph = makeGraph([
      entry({ login: 'busy', exactCommits: 5, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'free', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const loadData = new Map([['busy', 5]]);
    const results = matchReviewers(graph, 'other', {
      topN: 2,
      loadBalancing: true,
      maxOpenReviews: 5,
      reviewLoadData: loadData,
    });
    // Without load balancing, busy (5 commits) would beat free (3 commits).
    // With 5 open reviews at max 5, busy gets 0.2x multiplier → should lose.
    assert.equal(results[0].login, 'free');
    assert.equal(results[1].login, 'busy');
  });

  it('does not penalize when load balancing is disabled', () => {
    const graph = makeGraph([
      entry({ login: 'busy', exactCommits: 5, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'free', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const loadData = new Map([['busy', 5]]);
    const results = matchReviewers(graph, 'other', {
      topN: 2,
      loadBalancing: false,
      reviewLoadData: loadData,
    });
    assert.equal(results[0].login, 'busy');
  });

  it('applies partial penalty for moderate review load', () => {
    const graph = makeGraph([
      entry({ login: 'moderate', exactCommits: 4, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'light', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const loadData = new Map([['moderate', 2]]);
    const results = matchReviewers(graph, 'other', {
      topN: 2,
      loadBalancing: true,
      maxOpenReviews: 5,
      reviewLoadData: loadData,
    });
    // moderate: 4*3 + ~2 = ~14, multiplier = 1 - (2/5*0.8) = 0.68 → ~9.5
    // light: 3*3 + ~2 = ~11, no penalty → ~11
    assert.equal(results[0].login, 'light');
  });

  it('includes review load in reasons when load balancing is enabled', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const loadData = new Map([['alice', 3]]);
    const results = matchReviewers(graph, 'bob', {
      loadBalancing: true,
      maxOpenReviews: 5,
      reviewLoadData: loadData,
    });
    assert.ok(results[0].reasons.some((r) => r.includes('3 open PR(s)')));
  });

  it('caps load penalty at maxOpenReviews', () => {
    const graph = makeGraph([
      entry({ login: 'overloaded', exactCommits: 10, dirCommits: 0, latestCommit: recentDate }),
    ]);
    // 10 reviews but max is 5 — penalty capped at the same as 5
    const loadData5 = new Map([['overloaded', 5]]);
    const loadData10 = new Map([['overloaded', 10]]);
    const r5 = matchReviewers(graph, 'other', {
      loadBalancing: true,
      maxOpenReviews: 5,
      reviewLoadData: loadData5,
    });
    const r10 = matchReviewers(graph, 'other', {
      loadBalancing: true,
      maxOpenReviews: 5,
      reviewLoadData: loadData10,
    });
    assert.equal(r5[0].score, r10[0].score);
  });
});
