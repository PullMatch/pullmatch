import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePRContextBrief } from '../context-brief.ts';
import type { ContributorEntry } from '../contributor-graph.ts';
import type { PRFile } from '../github.ts';
import type { ReviewerRecommendation } from '../index.ts';

function makeGraph(entries: ContributorEntry[]): Map<string, ContributorEntry> {
  const graph = new Map<string, ContributorEntry>();
  for (const entry of entries) {
    graph.set(entry.login, entry);
  }
  return graph;
}

const files: PRFile[] = [
  { filename: 'packages/shared/src/matcher.ts', status: 'modified' },
  { filename: 'packages/shared/src/contributor-graph.ts', status: 'modified' },
  { filename: 'apps/api/src/webhook.ts', status: 'added' },
];

describe('generatePRContextBrief', () => {
  it('builds a readable brief for a single reviewer', () => {
    const recommendations: ReviewerRecommendation[] = [
      {
        login: 'alice',
        score: 12.34,
        reasons: ['3 commit(s) to exact changed file(s)', 'Most recent commit was 2 day(s) ago'],
      },
    ];

    const graph = makeGraph([
      {
        login: 'alice',
        exactCommits: 3,
        dirCommits: 1,
        latestCommit: '2026-03-25T00:00:00.000Z',
      },
    ]);

    const result = generatePRContextBrief({
      prId: 'PR-101',
      prTitle: 'Improve reviewer matching diagnostics',
      files,
      commitMessages: ['improve scorer explainability\n\nadds detail', 'tighten test assertions'],
      recommendations,
      contributorGraph: graph,
    });

    assert.equal(result.reviewerSections.length, 1);
    assert.equal(result.reviewerSections[0].login, 'alice');
    assert.match(result.summary, /3 file\(s\) changed/);
    assert.match(result.markdown, /## PullMatch PR Context Brief/);
    assert.match(result.markdown, /#### @alice \(score: 12.34\)/);
    assert.match(result.markdown, /Why this reviewer:/);
    assert.match(result.markdown, /Focus areas:/);
  });

  it('includes sections for multiple reviewers in recommendation order', () => {
    const recommendations: ReviewerRecommendation[] = [
      { login: 'bob', score: 10.1, reasons: ['reason a'] },
      { login: 'carol', score: 8.4, reasons: ['reason b'] },
    ];

    const graph = makeGraph([
      { login: 'bob', exactCommits: 1, dirCommits: 3, latestCommit: '2026-03-20T00:00:00.000Z' },
      { login: 'carol', exactCommits: 2, dirCommits: 0, latestCommit: '2026-03-19T00:00:00.000Z' },
    ]);

    const result = generatePRContextBrief({
      prId: 'PR-102',
      files,
      commitMessages: ['add webhook fallback'],
      recommendations,
      contributorGraph: graph,
    });

    assert.equal(result.reviewerSections[0].login, 'bob');
    assert.equal(result.reviewerSections[1].login, 'carol');
    assert.match(result.markdown, /#### @bob \(score: 10.1\)/);
    assert.match(result.markdown, /#### @carol \(score: 8.4\)/);
  });

  it('handles reviewer with no contributor history', () => {
    const recommendations: ReviewerRecommendation[] = [
      {
        login: 'dave',
        score: 6,
        reasons: ['Matched by ranking fallback'],
      },
    ];

    const result = generatePRContextBrief({
      prId: 'PR-103',
      files,
      commitMessages: [],
      recommendations,
      contributorGraph: makeGraph([]),
    });

    assert.match(result.markdown, /no direct file history was found/i);
    assert.match(result.markdown, /fresh pass on edge cases/i);
    assert.equal(result.reviewerSections[0].whyPicked[1], 'Matched by ranking fallback');
  });
});
