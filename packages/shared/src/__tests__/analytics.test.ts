import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequestId, serializeAnalyticsEvent } from '../analytics.ts';

describe('analytics helpers', () => {
  it('creates request IDs', () => {
    const requestId = createRequestId();
    assert.equal(typeof requestId, 'string');
    assert.ok(requestId.length > 10);
  });

  it('serializes events with metadata', () => {
    const serialized = serializeAnalyticsEvent({
      name: 'installation_event',
      requestId: 'req-123',
      properties: { action: 'created', org: 'acme', repoCount: 2 },
    });

    assert.equal(serialized.type, 'analytics');
    assert.equal(serialized.name, 'installation_event');
    assert.equal(serialized.requestId, 'req-123');
    assert.equal(serialized.properties.action, 'created');
    assert.equal(serialized.properties.repoCount, 2);
    assert.ok(Date.parse(serialized.timestamp) > 0);
  });
});
