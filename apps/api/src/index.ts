import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createWebhookRouter } from './webhook.ts';
import { logger } from './logger.ts';

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

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const webhookRouter = createWebhookRouter(webhookSecret);
app.route('/', webhookRouter);

serve({ fetch: app.fetch, port }, () => {
  logger.info(`PullMatch API running on port ${port}`);
});
