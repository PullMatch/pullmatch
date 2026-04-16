import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysisPipeline, type ParsedPREvent } from './webhook.ts';

const event: ParsedPREvent = {
  action: 'opened',
  deliveryId: 'delivery-1',
  repo: 'acme/widgets',
  owner: 'acme',
  repoName: 'widgets',
  prNumber: 42,
  title: 'Improve reviewer routing',
  author: 'author-user',
  branch: 'feature/reviewer-routing',
  baseBranch: 'main',
  sha: 'abc123',
  diffUrl: 'https://example.com/diff',
  htmlUrl: 'https://example.com/pr/42',
};

describe('runAnalysisPipeline', () => {
  it('posts reviewer recommendations with context briefs', async () => {
    const postCalls: Array<{ owner: string; repo: string; prNumber: number; body: string; token: string }> = [];

    const deps = {
      fetchPRFiles: async () => [
        { filename: 'apps/api/src/webhook.ts', status: 'modified' },
        { filename: 'packages/shared/src/context-brief.ts', status: 'modified' },
      ],
      fetchPRCommitMessages: async () => ['add reviewer context brief integration'],
      buildContributorGraph: async () => {
        const graph = new Map<string, { login: string; exactCommits: number; dirCommits: number; latestCommit: string }>();
        graph.set('alice', {
          login: 'alice',
          exactCommits: 2,
          dirCommits: 1,
          latestCommit: '2026-03-26T00:00:00.000Z',
        });
        return graph;
      },
      matchReviewers: () => [
        {
          login: 'alice',
          score: 9.5,
          reasons: ['2 commit(s) to exact changed file(s)', 'Most recent commit was 1 day(s) ago'],
        },
      ],
      generatePRContextBrief: () => ({
        prId: 'acme/widgets#42',
        summary: '2 file(s) changed',
        reviewerSections: [
          {
            login: 'alice',
            score: 9.5,
            whyPicked: ['Strong ownership in changed files'],
            focusAreas: ['Validate webhook event parsing branch logic'],
          },
        ],
        markdown: 'unused in this test',
      }),
      postPRComment: async (owner: string, repo: string, prNumber: number, body: string, token: string) => {
        postCalls.push({ owner, repo, prNumber, body, token });
      },
    };

    await runAnalysisPipeline(event, 'token-123', deps);

    assert.equal(postCalls.length, 1);
    const posted = postCalls[0];
    assert.equal(posted.owner, 'acme');
    assert.equal(posted.repo, 'widgets');
    assert.equal(posted.prNumber, 42);
    assert.equal(posted.token, 'token-123');

    assert.match(posted.body, /## PullMatch Reviewer Suggestions/);
    assert.match(posted.body, /### @alice \(score: 9\.5\)/);
    assert.match(posted.body, /Recommendation signals:/);
    assert.match(posted.body, /Context brief:/);
    assert.match(posted.body, /Why this reviewer:/);
    assert.match(posted.body, /Focus areas:/);
    assert.match(posted.body, /Validate webhook event parsing branch logic/);
  });
});
