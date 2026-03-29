import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createWebhookRouter } from './webhook.ts';
import { logger } from './logger.ts';

// --- Environment validation ---
const required = ['GITHUB_WEBHOOK_SECRET'] as const;
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  logger.error('Missing required environment variables', { missing });
  process.exit(1);
}

// Validate that at least one auth method is configured
const hasAppAuth =
  process.env.GITHUB_APP_ID &&
  process.env.GITHUB_APP_PRIVATE_KEY &&
  process.env.GITHUB_APP_INSTALLATION_ID;
const hasTokenAuth = !!process.env.GITHUB_TOKEN_WRITE;

if (!hasAppAuth && !hasTokenAuth) {
  logger.error('No GitHub auth configured. Set either GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID, or GITHUB_TOKEN_WRITE');
  process.exit(1);
}

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET!;
const port = Number(process.env.PORT) || 3000;

// --- Startup log ---
logger.info('Starting PullMatch API', {
  port,
  authMethod: hasAppAuth ? 'github-app' : 'token',
  githubAppId: process.env.GITHUB_APP_ID ? 'set' : 'unset',
  githubTokenWriteSet: hasTokenAuth,
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
