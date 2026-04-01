import type { Context } from 'hono';
import { logger } from './logger.ts';

// --- Operational state (in-memory, resets on deploy) ---

interface LastError {
  message: string;
  timestamp: string;
}

interface OperationalState {
  lastWebhookAt: string | null;
  totalWebhooksProcessed: number;
  lastError: LastError | null;
  totalErrors: number;
}

const state: OperationalState = {
  lastWebhookAt: null,
  totalWebhooksProcessed: 0,
  lastError: null,
  totalErrors: 0,
};

export function recordWebhookReceived(): void {
  state.lastWebhookAt = new Date().toISOString();
  state.totalWebhooksProcessed += 1;
}

export function recordError(message: string): void {
  state.totalErrors += 1;
  state.lastError = {
    message,
    timestamp: new Date().toISOString(),
  };
}

export function getOperationalState(): OperationalState {
  return { ...state };
}

// --- Error handling middleware ---

export async function errorMiddleware(err: Error, c: Context): Promise<Response> {
  const requestId = c.req.header('X-PullMatch-Request-Id') ?? c.res?.headers.get('X-PullMatch-Request-Id') ?? 'unknown';
  const path = c.req.path;
  const method = c.req.method;

  const errorMessage = err.message ?? String(err);
  recordError(errorMessage);

  logger.error('Unhandled error', {
    requestId,
    method,
    path,
    error: errorMessage,
    stack: err.stack,
  });

  return c.json(
    {
      error: 'Internal server error',
      requestId,
    },
    500
  );
}

// --- Stats auth middleware ---

export function requireStatsAuth(c: Context): Response | null {
  const statsKey = process.env.STATS_API_KEY;
  if (!statsKey) {
    // No key configured — stats endpoint is disabled
    return c.json({ error: 'Stats endpoint not configured' }, 503);
  }

  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${statsKey}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return null; // auth passed
}
