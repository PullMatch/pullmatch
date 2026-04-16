import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCodeownersTeams, parseCodeownersIndividuals, annotateCodeowners } from '../teams.ts';
import { matchReviewers } from '../matcher.ts';
import type { ContributorEntry } from '../contributor-graph.ts';
import type { TeamResolutionResult } from '../teams.ts';

function makeGraph(entries: ContributorEntry[]): Map<string, ContributorEntry> {
  const m = new Map<string, ContributorEntry>();
  for (const e of entries) m.set(e.login, e);
  return m;
}

const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

function entry(overrides: Partial<ContributorEntry> & { login: string; exactCommits: number; dirCommits: number; latestCommit: string }): ContributorEntry {
  return { isCodeOwner: false, codeOwnerFiles: 0, ...overrides };
}

describe('parseCodeownersTeams', () => {
  it('extracts team entries from CODEOWNERS', () => {
    const content = [
      '# Global owners',
      '* @fallback-user',
      '/src/frontend/ @acme/frontend-team',
      '/src/backend/ @acme/backend-team @individual-user',
      '',
      '# Docs',
      'docs/ @acme/docs-team',
    ].join('\n');

    const teams = parseCodeownersTeams(content);
    assert.equal(teams.length, 3);
    assert.deepEqual(teams[0], { pattern: '/src/frontend/', org: 'acme', teamSlug: 'frontend-team' });
    assert.deepEqual(teams[1], { pattern: '/src/backend/', org: 'acme', teamSlug: 'backend-team' });
    assert.deepEqual(teams[2], { pattern: 'docs/', org: 'acme', teamSlug: 'docs-team' });
  });

  it('ignores comments and blank lines', () => {
    const content = '# comment\n\n';
    assert.deepEqual(parseCodeownersTeams(content), []);
  });

  it('handles multiple teams on one line', () => {
    const content = '*.ts @org/ts-team @org/review-team';
    const teams = parseCodeownersTeams(content);
    assert.equal(teams.length, 2);
    assert.equal(teams[0].teamSlug, 'ts-team');
    assert.equal(teams[1].teamSlug, 'review-team');
  });

  it('skips individual owners (no org prefix)', () => {
    const content = '/src/ @just-a-user';
    assert.deepEqual(parseCodeownersTeams(content), []);
  });
});

describe('parseCodeownersIndividuals', () => {
  it('extracts individual user entries from CODEOWNERS', () => {
    const content = [
      '*.ts @alice @acme/ts-team',
      '/docs/ @bob',
      '# comment',
      '',
      '*.md @charlie',
    ].join('\n');

    const individuals = parseCodeownersIndividuals(content);
    assert.equal(individuals.length, 3);
    assert.deepEqual(individuals[0], { pattern: '*.ts', login: 'alice' });
    assert.deepEqual(individuals[1], { pattern: '/docs/', login: 'bob' });
    assert.deepEqual(individuals[2], { pattern: '*.md', login: 'charlie' });
  });

  it('skips team entries', () => {
    const content = '/src/ @acme/frontend-team';
    assert.deepEqual(parseCodeownersIndividuals(content), []);
  });
});

describe('annotateCodeowners', () => {
  it('sets isCodeOwner and codeOwnerFiles on matching graph entries', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'bob', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
    ]);

    const codeowners = '*.ts @alice\n/docs/ @bob\n';
    annotateCodeowners(graph, codeowners, ['src/main.ts', 'src/utils.ts']);

    const alice = graph.get('alice')!;
    assert.equal(alice.isCodeOwner, true);
    assert.equal(alice.codeOwnerFiles, 2); // both .ts files match

    const bob = graph.get('bob')!;
    // No docs/ files in changedFiles, so bob should not be a code owner
    assert.notEqual(bob.isCodeOwner, true);
  });

  it('does nothing when no individual owners in CODEOWNERS', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
    ]);

    annotateCodeowners(graph, '/src/ @acme/team\n', ['src/main.ts']);
    assert.notEqual(graph.get('alice')!.isCodeOwner, true);
  });

  it('handles empty CODEOWNERS content', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
    ]);

    annotateCodeowners(graph, '', ['src/main.ts']);
    assert.notEqual(graph.get('alice')!.isCodeOwner, true);
  });
});

describe('matchReviewers with team resolution', () => {
  it('boosts team members who own changed files', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'bob', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
    ]);

    const teamResolution: TeamResolutionResult = {
      memberTeams: new Map([['bob', ['frontend-team']]]),
      teamFileOwnership: new Map([['acme/frontend-team', 3]]),
      teamOwnerLogins: new Set(['bob']),
    };

    const results = matchReviewers(graph, 'other', { topN: 2, teamResolution });
    // Bob should rank higher due to team bonus
    assert.equal(results[0].login, 'bob');
    assert.ok(results[0].reasons.some((r) => r.includes('frontend-team')));
  });

  it('stacks team bonus with codeowner bonus', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate, isCodeOwner: true, codeOwnerFiles: 1 }),
      entry({ login: 'bob', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
    ]);

    const teamResolution: TeamResolutionResult = {
      memberTeams: new Map([['alice', ['platform']]]),
      teamFileOwnership: new Map([['acme/platform', 2]]),
      teamOwnerLogins: new Set(['alice']),
    };

    const results = matchReviewers(graph, 'other', { topN: 2, teamResolution });
    // Alice has codeowner + team bonus
    assert.equal(results[0].login, 'alice');
    assert.ok(results[0].score > results[1].score);
  });

  it('works without team resolution (backward compatible)', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const results = matchReviewers(graph, 'other');
    assert.equal(results.length, 1);
    assert.equal(results[0].login, 'alice');
  });

  it('supports numeric topN for backward compatibility', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 3, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'bob', exactCommits: 2, dirCommits: 0, latestCommit: recentDate }),
    ]);
    const results = matchReviewers(graph, 'other', 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].login, 'alice');
  });

  it('gives higher bonus for membership in multiple owning teams', () => {
    const graph = makeGraph([
      entry({ login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
      entry({ login: 'bob', exactCommits: 1, dirCommits: 0, latestCommit: recentDate }),
    ]);

    const teamResolution: TeamResolutionResult = {
      memberTeams: new Map([
        ['alice', ['frontend', 'platform']],
        ['bob', ['frontend']],
      ]),
      teamFileOwnership: new Map([['acme/frontend', 2], ['acme/platform', 1]]),
      teamOwnerLogins: new Set(['alice', 'bob']),
    };

    const results = matchReviewers(graph, 'other', { topN: 2, teamResolution });
    // Alice in 2 teams, Bob in 1 — Alice ranks higher
    assert.equal(results[0].login, 'alice');
    assert.ok(results[0].score > results[1].score);
  });
});
