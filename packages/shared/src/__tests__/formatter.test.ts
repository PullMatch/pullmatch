import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatReviewerComment } from '../formatter.ts';
import { PULLMATCH_MARKER } from '../github.ts';
import type { ExpertiseMap } from '../expertise.ts';

describe('formatReviewerComment', () => {
  it('renders reviewer sections with context and reasons', () => {
    const output = formatReviewerComment({
      title: 'Improve auth middleware',
      recommendations: [
        {
          login: 'alice',
          score: 85,
          reasons: ['Strong ownership in API modules'],
        },
      ],
      briefs: new Map([
        ['alice', { reviewer: 'alice', brief: '- **What changed:** auth refresh logic.\n- **What to look for:** error handling.' }],
      ]),
    });

    assert.ok(output.includes(PULLMATCH_MARKER));
    assert.ok(output.includes('## PullMatch Reviewer Suggestions'));
    assert.ok(output.includes('### @alice (score: 85)'));
    assert.ok(output.includes('> **Context:**'));
    assert.ok(output.includes('> - **What changed:** auth refresh logic.'));
    assert.ok(output.includes('- Strong ownership in API modules'));
  });

  it('includes expertise tag when available', () => {
    const expertiseMap: ExpertiseMap = {
      alice: [{ domain: 'API', score: 9 }],
    };
    const output = formatReviewerComment({
      title: 'Add webhook retries',
      recommendations: [
        {
          login: 'alice',
          score: 91,
          reasons: [],
        },
      ],
      expertiseMap,
    });

    assert.ok(output.includes('### @alice (score: 91) — API specialist, 9 commit(s)'));
  });

  it('renders degradation and footer notes', () => {
    const output = formatReviewerComment({
      title: 'Improve resilience',
      recommendations: [],
      degradationNotes: ['Contributor graph unavailable; using partial metadata.'],
      footerNotes: ['GitHub API rate limit is low: 5/5000 remaining.'],
    });

    assert.ok(output.includes('No confident reviewer candidates were found for this PR yet.'));
    assert.ok(output.includes('### Analysis Notes'));
    assert.ok(output.includes('- Contributor graph unavailable; using partial metadata.'));
    assert.ok(output.includes('- GitHub API rate limit is low: 5/5000 remaining.'));
  });
});
