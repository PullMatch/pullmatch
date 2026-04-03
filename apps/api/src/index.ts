import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { StatsCollector } from '@pullmatch/shared';
import { createWebhookRouter } from './webhook.ts';
import { logger } from './logger.ts';
import { errorMiddleware, getOperationalState, requireStatsAuth } from './observability.ts';

// --- Environment validation ---
// GITHUB_WEBHOOK_SECRET is always required.
// Auth: either GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (multi-org) or GITHUB_TOKEN_WRITE (single-org fallback).
if (!process.env.GITHUB_WEBHOOK_SECRET) {
  logger.error('Missing required environment variable: GITHUB_WEBHOOK_SECRET');
  process.exit(1);
}

const hasAppAuth = !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
const hasFallbackToken = !!process.env.GITHUB_TOKEN_WRITE;

if (!hasAppAuth && !hasFallbackToken) {
  logger.error('No GitHub auth configured. Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY for multi-org, or GITHUB_TOKEN_WRITE as fallback.');
  process.exit(1);
}

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET!;
const port = Number(process.env.PORT) || 3000;

// --- Startup log ---
logger.info('Starting PullMatch API', {
  port,
  authMode: hasAppAuth ? 'github-app' : 'token-fallback',
  githubAppId: process.env.GITHUB_APP_ID ? 'set' : 'unset',
  githubTokenWriteSet: hasFallbackToken,
  version: process.env.npm_package_version ?? '0.0.1',
});

// --- App setup ---
const app = new Hono();
const statsCollector = new StatsCollector(20);
const startedAt = Date.now();

app.onError(errorMiddleware);

app.get('/health', (c) => {
  const ops = getOperationalState();
  return c.json({
    status: 'ok',
    version: '1.2.0',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    lastWebhookAt: ops.lastWebhookAt,
    totalWebhooksProcessed: ops.totalWebhooksProcessed,
    lastError: ops.lastError,
    env: {
      hasGithubToken: !!process.env.GITHUB_TOKEN_WRITE,
      hasWebhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET,
      hasAppId: !!process.env.GITHUB_APP_ID,
      hasPrivateKey: !!process.env.GITHUB_APP_PRIVATE_KEY,
    },
  });
});

app.get('/stats', (c) => {
  const denied = requireStatsAuth(c);
  if (denied) return denied;

  const stats = statsCollector.getStats();
  const ops = getOperationalState();
  return c.json({
    ...stats,
    error_rate: stats.total_prs_analyzed > 0
      ? +(ops.totalErrors / stats.total_prs_analyzed).toFixed(4)
      : 0,
    total_errors: ops.totalErrors,
    recent: statsCollector.getRecent(),
  });
});

app.get('/api/stats', (c) => c.json(statsCollector.getStats()));
app.get('/api/recent', (c) => c.json(statsCollector.getRecent()));

const webhookRouter = createWebhookRouter(webhookSecret, statsCollector);
app.route('/', webhookRouter);

serve({ fetch: app.fetch, port }, () => {
  logger.info(`PullMatch API running on port ${port}`);
});
