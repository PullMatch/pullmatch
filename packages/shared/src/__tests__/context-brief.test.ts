import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateContextBrief } from '../context-brief.ts';
import type { ContributorEntry } from '../contributor-graph.ts';

function makeGraph(entries: ContributorEntry[]): Map<string, ContributorEntry> {
  const m = new Map<string, ContributorEntry>();
  for (const e of entries) m.set(e.login, e);
  return m;
}

const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

describe('generateContextBrief', () => {
  it('generates summary from file paths', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 3, dirCommits: 1, latestCommit: recentDate },
    ]);
    const brief = generateContextBrief(
      { title: 'Fix auth bug', branch: 'fix/auth', filesChanged: ['src/auth.ts', 'src/middleware.ts', 'tests/auth.test.ts'] },
      'alice',
      graph
    );
    assert.equal(brief.reviewer, 'alice');
    assert.equal(brief.prId, 'fix/auth');
    assert.ok(brief.summary.includes('src'));
    assert.ok(brief.summary.includes('tests'));
  });

  it('focus areas match reviewer expertise to changed files', () => {
    const graph = makeGraph([
      { login: 'bob', exactCommits: 2, dirCommits: 1, latestCommit: recentDate },
    ]);
    const brief = generateContextBrief(
      { title: 'Update API', branch: 'feat/api', filesChanged: ['apps/api/src/webhook.ts', 'packages/shared/src/matcher.ts'] },
      'bob',
      graph
    );
    assert.ok(brief.focusAreas.length > 0);
    // Should have both exact file and directory entries
    assert.ok(brief.focusAreas.some(a => a.includes('direct contributor')));
    assert.ok(brief.focusAreas.some(a => a.includes('directory contributor')));
  });

  it('handles empty graph gracefully', () => {
    const graph = new Map<string, ContributorEntry>();
    const brief = generateContextBrief(
      { title: 'Update README', branch: 'docs/readme', filesChanged: ['README.md'] },
      'charlie',
      graph
    );
    assert.equal(brief.reviewer, 'charlie');
    assert.equal(brief.focusAreas.length, 0);
    assert.ok(brief.summary.length > 0);
  });

  it('handles empty filesChanged', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate },
    ]);
    const brief = generateContextBrief(
      { title: 'Empty PR', branch: 'empty', filesChanged: [] },
      'alice',
      graph
    );
    assert.equal(brief.summary, 'No files changed');
  });

  it('handles single file change', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 1, dirCommits: 0, latestCommit: recentDate },
    ]);
    const brief = generateContextBrief(
      { title: 'Single file', branch: 'single', filesChanged: ['src/index.ts'] },
      'alice',
      graph
    );
    assert.equal(brief.summary, 'Changes to src/index.ts');
  });

  it('includes code owner info in focus areas', () => {
    const graph = makeGraph([
      { login: 'alice', exactCommits: 0, dirCommits: 0, latestCommit: recentDate, isCodeOwner: true, codeOwnerFiles: 3 },
    ]);
    const brief = generateContextBrief(
      { title: 'Fix', branch: 'fix', filesChanged: ['src/a.ts'] },
      'alice',
      graph
    );
    assert.ok(brief.focusAreas.some(a => a.includes('Code owner')));
  });
});
