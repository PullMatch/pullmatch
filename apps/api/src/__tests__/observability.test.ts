import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Hono } from 'hono';
import {
  recordWebhookReceived,
  recordError,
  getOperationalState,
  errorMiddleware,
  requireStatsAuth,
} from '../observability.ts';

describe('observability', () => {
  describe('operational state tracking', () => {
    it('tracks webhook received events', () => {
      const before = getOperationalState();
      const initialCount = before.totalWebhooksProcessed;

      recordWebhookReceived();

      const after = getOperationalState();
      assert.equal(after.totalWebhooksProcessed, initialCount + 1);
      assert.ok(after.lastWebhookAt);
    });

    it('tracks errors', () => {
      const before = getOperationalState();
      const initialCount = before.totalErrors;

      recordError('something broke');

      const after = getOperationalState();
      assert.equal(after.totalErrors, initialCount + 1);
      assert.ok(after.lastError);
      assert.equal(after.lastError!.message, 'something broke');
      assert.ok(after.lastError!.timestamp);
    });
  });

  describe('errorMiddleware', () => {
    it('returns 500 with structured error response', async () => {
      const app = new Hono();
      app.onError(errorMiddleware);
      app.get('/boom', () => {
        throw new Error('test explosion');
      });

      const res = await app.request('/boom');
      assert.equal(res.status, 500);

      const body = (await res.json()) as { error: string; requestId: string };
      assert.equal(body.error, 'Internal server error');
      assert.ok(body.requestId);
    });
  });

  describe('requireStatsAuth', () => {
    const savedKey = process.env.STATS_API_KEY;

    afterEach(() => {
      if (savedKey === undefined) delete process.env.STATS_API_KEY;
      else process.env.STATS_API_KEY = savedKey;
    });

    it('returns 503 when STATS_API_KEY is not set', async () => {
      delete process.env.STATS_API_KEY;

      const app = new Hono();
      app.get('/stats', (c) => {
        const denied = requireStatsAuth(c);
        if (denied) return denied;
        return c.json({ ok: true });
      });

      const res = await app.request('/stats');
      assert.equal(res.status, 503);
    });

    it('returns 401 with wrong token', async () => {
      process.env.STATS_API_KEY = 'correct-key';

      const app = new Hono();
      app.get('/stats', (c) => {
        const denied = requireStatsAuth(c);
        if (denied) return denied;
        return c.json({ ok: true });
      });

      const res = await app.request('/stats', {
        headers: { Authorization: 'Bearer wrong-key' },
      });
      assert.equal(res.status, 401);
    });

    it('passes with correct token', async () => {
      process.env.STATS_API_KEY = 'correct-key';

      const app = new Hono();
      app.get('/stats', (c) => {
        const denied = requireStatsAuth(c);
        if (denied) return denied;
        return c.json({ ok: true });
      });

      const res = await app.request('/stats', {
        headers: { Authorization: 'Bearer correct-key' },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean };
      assert.equal(body.ok, true);
    });
  });
});
