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
});
