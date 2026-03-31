import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StatsCollector } from '../stats.ts';

describe('StatsCollector', () => {
  it('aggregates completed analysis stats and recent analyses', () => {
    const collector = new StatsCollector(20);

    collector.increment({
      type: 'analytics',
      name: 'analysis_complete',
      timestamp: '2026-03-30T00:00:00.000Z',
      properties: {
        repo: 'acme/pullmatch',
        pr_number: 42,
        reviewers_suggested: 2,
        response_ms: 120,
      },
    });

    collector.increment({
      type: 'analytics',
      name: 'analysis_complete',
      timestamp: '2026-03-30T00:01:00.000Z',
      properties: {
        repo: 'acme/pullmatch',
        pr_number: 43,
        reviewers_suggested: 1,
        response_ms: 80,
      },
    });

    assert.deepEqual(collector.getStats(), {
      total_prs_analyzed: 2,
      total_reviewers_suggested: 3,
      active_installations: 0,
      avg_response_ms: 100,
    });

    assert.deepEqual(collector.getRecent(), [
      {
        repo: 'acme/pullmatch',
        pr_number: 43,
        reviewers_suggested: 1,
        timestamp: '2026-03-30T00:01:00.000Z',
      },
      {
        repo: 'acme/pullmatch',
        pr_number: 42,
        reviewers_suggested: 2,
        timestamp: '2026-03-30T00:00:00.000Z',
      },
    ]);
  });

  it('tracks installation count and ignores incomplete analysis events', () => {
    const collector = new StatsCollector(20);

    collector.increment({
      type: 'analytics',
      name: 'installation_event',
      timestamp: '2026-03-30T00:00:00.000Z',
      properties: { action: 'created' },
    });
    collector.increment({
      type: 'analytics',
      name: 'installation_event',
      timestamp: '2026-03-30T00:00:01.000Z',
      properties: { action: 'created' },
    });
    collector.increment({
      type: 'analytics',
      name: 'installation_event',
      timestamp: '2026-03-30T00:00:02.000Z',
      properties: { action: 'deleted' },
    });

    collector.increment({
      type: 'analytics',
      name: 'analysis_complete',
      timestamp: '2026-03-30T00:00:03.000Z',
      properties: {
        repo: 'acme/pullmatch',
        pr_number: 44,
      },
    });

    assert.deepEqual(collector.getStats(), {
      total_prs_analyzed: 0,
      total_reviewers_suggested: 0,
      active_installations: 1,
      avg_response_ms: 0,
    });
    assert.deepEqual(collector.getRecent(), []);
  });

  it('keeps only the latest N analyses', () => {
    const collector = new StatsCollector(2);

    collector.increment({
      type: 'analytics',
      name: 'analysis_complete',
      timestamp: '2026-03-30T00:00:00.000Z',
      properties: { repo: 'acme/repo', pr_number: 1, reviewers_suggested: 1, response_ms: 10 },
    });
    collector.increment({
      type: 'analytics',
      name: 'analysis_complete',
      timestamp: '2026-03-30T00:00:01.000Z',
      properties: { repo: 'acme/repo', pr_number: 2, reviewers_suggested: 1, response_ms: 20 },
    });
    collector.increment({
      type: 'analytics',
      name: 'analysis_complete',
      timestamp: '2026-03-30T00:00:02.000Z',
      properties: { repo: 'acme/repo', pr_number: 3, reviewers_suggested: 1, response_ms: 30 },
    });

    assert.deepEqual(collector.getRecent().map((item) => item.pr_number), [3, 2]);
  });
});
