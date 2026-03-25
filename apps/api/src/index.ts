import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createWebhookRouter } from './webhook.ts';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.warn('[startup] WARNING: GITHUB_WEBHOOK_SECRET not set — webhook endpoint will reject all requests');
}

const webhookRouter = createWebhookRouter(webhookSecret ?? 'unset');
app.route('/', webhookRouter);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`PullMatch API running on port ${port}`);
});
