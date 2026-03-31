import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Hono } from 'hono';

// Build a minimal app that mirrors the health route from index.ts
// We test the route handler logic directly rather than importing index.ts
// (which has side effects like env validation and server startup).

function createHealthApp() {
  const app = new Hono();
  const startedAt = Date.now();

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      version: '1.2.0',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      env: {
        hasGithubToken: !!process.env.GITHUB_TOKEN_WRITE,
        hasWebhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET,
        hasAppId: !!process.env.GITHUB_APP_ID,
        hasPrivateKey: !!process.env.GITHUB_APP_PRIVATE_KEY,
      },
    });
  });

  return app;
}

describe('/health endpoint', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ['GITHUB_TOKEN_WRITE', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY']) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('returns 200 with expected shape', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'secret';
    process.env.GITHUB_APP_ID = '12345';
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_TOKEN_WRITE;

    const app = createHealthApp();
    const res = await app.request('/health');

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      uptime: number;
      env: Record<string, boolean>;
    };

    assert.equal(body.status, 'ok');
    assert.equal(body.version, '1.2.0');
    assert.equal(typeof body.uptime, 'number');
    assert.ok(body.uptime >= 0);

    assert.equal(body.env.hasGithubToken, false);
    assert.equal(body.env.hasWebhookSecret, true);
    assert.equal(body.env.hasAppId, true);
    assert.equal(body.env.hasPrivateKey, false);
  });

  it('reflects all env vars when fully configured', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'secret';
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = 'pk';
    process.env.GITHUB_TOKEN_WRITE = 'tok';

    const app = createHealthApp();
    const res = await app.request('/health');
    const body = (await res.json()) as { env: Record<string, boolean> };

    assert.equal(body.env.hasGithubToken, true);
    assert.equal(body.env.hasWebhookSecret, true);
    assert.equal(body.env.hasAppId, true);
    assert.equal(body.env.hasPrivateKey, true);
  });
});
