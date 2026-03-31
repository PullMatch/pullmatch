import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  recordReviewOutcome,
  getReviewStats,
  getOutcomesForPR,
  clearReviewStore,
} from '../review-tracker.ts';

afterEach(() => {
  clearReviewStore();
});

describe('review-tracker', () => {
  it('records and retrieves outcomes for a PR', () => {
    recordReviewOutcome('acme/repo', 1, 'alice', 'approved', '2026-03-30T00:00:00Z');
    recordReviewOutcome('acme/repo', 1, 'bob', 'changes_requested', '2026-03-30T01:00:00Z');

    const outcomes = getOutcomesForPR('acme/repo', 1);
    assert.equal(outcomes.length, 2);
    assert.equal(outcomes[0].reviewer, 'alice');
    assert.equal(outcomes[0].action, 'approved');
    assert.equal(outcomes[1].reviewer, 'bob');
    assert.equal(outcomes[1].action, 'changes_requested');
  });

  it('returns empty array for unknown PR', () => {
    const outcomes = getOutcomesForPR('acme/repo', 999);
    assert.deepEqual(outcomes, []);
  });

  it('computes per-reviewer stats for a repo', () => {
    recordReviewOutcome('acme/repo', 1, 'alice', 'approved', '2026-03-30T00:00:00Z');
    recordReviewOutcome('acme/repo', 2, 'alice', 'approved', '2026-03-30T01:00:00Z');
    recordReviewOutcome('acme/repo', 3, 'alice', 'changes_requested', '2026-03-30T02:00:00Z');
    recordReviewOutcome('acme/repo', 1, 'bob', 'commented', '2026-03-30T03:00:00Z');

    const stats = getReviewStats('acme/repo');

    const aliceStats = stats.get('alice');
    assert.ok(aliceStats);
    assert.equal(aliceStats.total, 3);
    assert.equal(aliceStats.approved, 2);
    assert.equal(aliceStats.changesRequested, 1);
    assert.equal(aliceStats.commented, 0);
    assert.equal(aliceStats.dismissed, 0);
    assert.ok(Math.abs(aliceStats.approvalRate - 2 / 3) < 0.001);

    const bobStats = stats.get('bob');
    assert.ok(bobStats);
    assert.equal(bobStats.total, 1);
    assert.equal(bobStats.commented, 1);
    assert.equal(bobStats.approvalRate, 0);
  });

  it('scopes stats to the requested repo only', () => {
    recordReviewOutcome('acme/repo', 1, 'alice', 'approved', '2026-03-30T00:00:00Z');
    recordReviewOutcome('other/repo', 2, 'alice', 'approved', '2026-03-30T01:00:00Z');

    const stats = getReviewStats('acme/repo');
    const aliceStats = stats.get('alice');
    assert.ok(aliceStats);
    assert.equal(aliceStats.total, 1);
  });

  it('tracks dismissed reviews', () => {
    recordReviewOutcome('acme/repo', 1, 'alice', 'dismissed', '2026-03-30T00:00:00Z');

    const stats = getReviewStats('acme/repo');
    const aliceStats = stats.get('alice');
    assert.ok(aliceStats);
    assert.equal(aliceStats.dismissed, 1);
    assert.equal(aliceStats.approvalRate, 0);
  });

  it('returns empty map for repo with no reviews', () => {
    const stats = getReviewStats('acme/nonexistent');
    assert.equal(stats.size, 0);
  });
});
