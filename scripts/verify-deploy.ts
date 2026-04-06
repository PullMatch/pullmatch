/**
 * Post-deploy E2E verification script.
 *
 * Usage:
 *   DEPLOY_URL=https://your-app.railway.app GITHUB_WEBHOOK_SECRET=xxx npx tsx scripts/verify-deploy.ts
 *
 * Optional:
 *   STATS_API_KEY=xxx   — also verify the /stats endpoint
 *   TIMEOUT_MS=5000     — per-request timeout (default 5000)
 */

import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEPLOY_URL = (process.env.DEPLOY_URL ?? '').replace(/\/+$/, '');
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const STATS_API_KEY = process.env.STATS_API_KEY ?? '';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 5_000;

if (!DEPLOY_URL) {
  console.error('ERROR: DEPLOY_URL is required.\n');
  console.error(
    'Usage: DEPLOY_URL=https://your-app.railway.app GITHUB_WEBHOOK_SECRET=xxx npx tsx scripts/verify-deploy.ts',
  );
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error('ERROR: GITHUB_WEBHOOK_SECRET is required.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckResult = { name: string; passed: boolean; detail: string };
const results: CheckResult[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${name}: ${detail}`);
}

function signPayload(secret: string, payload: string): string {
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hmac}`;
}

async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkHealth(): Promise<void> {
  try {
    const res = await timedFetch(`${DEPLOY_URL}/health`);
    if (res.status !== 200) {
      record('health', false, `HTTP ${res.status}`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;

    const requiredKeys = ['status', 'version', 'uptime', 'env'];
    const missing = requiredKeys.filter((k) => !(k in body));
    if (missing.length > 0) {
      record('health', false, `Missing keys: ${missing.join(', ')}`);
      return;
    }

    if (body.status !== 'ok') {
      record('health', false, `status=${JSON.stringify(body.status)}, expected "ok"`);
      return;
    }

    const env = body.env as Record<string, unknown> | undefined;
    if (!env || typeof env !== 'object') {
      record('health', false, 'env field is not an object');
      return;
    }

    record('health', true, `v${body.version}, uptime ${body.uptime}s`);
  } catch (err) {
    record('health', false, errorMessage(err));
  }
}

async function checkWebhook(): Promise<void> {
  try {
    const payload = JSON.stringify({
      action: 'opened',
      number: 99999,
      pull_request: {
        number: 99999,
        title: 'verify-deploy E2E test',
        user: { login: 'verify-deploy-bot' },
        head: { ref: 'verify/deploy', sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
        base: { ref: 'main' },
        diff_url: 'https://example.test/diff',
        html_url: 'https://example.test/pull/99999',
      },
      repository: {
        full_name: 'pullmatch/verify-deploy-test',
        name: 'verify-deploy-test',
        owner: { login: 'pullmatch' },
      },
    });

    const signature = signPayload(WEBHOOK_SECRET, payload);

    const res = await timedFetch(`${DEPLOY_URL}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature,
        'x-github-event': 'pull_request',
        'x-github-delivery': `verify-deploy-${Date.now()}`,
      },
      body: payload,
    });

    if (res.status !== 200) {
      const text = await res.text().catch(() => '');
      record('webhook', false, `HTTP ${res.status}: ${text.slice(0, 200)}`);
      return;
    }

    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok !== true) {
      record('webhook', false, `Response body: ${JSON.stringify(body).slice(0, 200)}`);
      return;
    }

    record('webhook', true, 'Accepted with valid signature');
  } catch (err) {
    record('webhook', false, errorMessage(err));
  }
}

async function checkWebhookBadSignature(): Promise<void> {
  try {
    const payload = JSON.stringify({ action: 'opened', number: 1 });
    const badSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    const res = await timedFetch(`${DEPLOY_URL}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': badSignature,
        'x-github-event': 'pull_request',
        'x-github-delivery': `verify-deploy-bad-${Date.now()}`,
      },
      body: payload,
    });

    if (res.status === 400) {
      record('webhook-reject-bad-sig', true, 'Correctly rejected invalid signature');
    } else {
      record('webhook-reject-bad-sig', false, `Expected 400, got HTTP ${res.status}`);
    }
  } catch (err) {
    record('webhook-reject-bad-sig', false, errorMessage(err));
  }
}

async function checkStats(): Promise<void> {
  if (!STATS_API_KEY) {
    console.log('  - stats: SKIPPED (STATS_API_KEY not set)');
    return;
  }

  try {
    // Verify auth rejection first
    const noAuth = await timedFetch(`${DEPLOY_URL}/stats`);
    if (noAuth.status !== 401) {
      record('stats-auth', false, `Expected 401 without auth, got HTTP ${noAuth.status}`);
    } else {
      record('stats-auth', true, 'Correctly rejected unauthenticated request');
    }

    // Verify with valid key
    const res = await timedFetch(`${DEPLOY_URL}/stats`, {
      headers: { Authorization: `Bearer ${STATS_API_KEY}` },
    });

    if (res.status !== 200) {
      record('stats', false, `HTTP ${res.status}`);
      return;
    }

    const body = (await res.json()) as Record<string, unknown>;
    const requiredKeys = [
      'total_prs_analyzed',
      'total_reviewers_suggested',
      'active_installations',
      'avg_response_ms',
    ];
    const missing = requiredKeys.filter((k) => !(k in body));
    if (missing.length > 0) {
      record('stats', false, `Missing keys: ${missing.join(', ')}`);
      return;
    }

    record(
      'stats',
      true,
      `${body.total_prs_analyzed} PRs analyzed, ${body.active_installations} installations`,
    );
  } catch (err) {
    record('stats', false, errorMessage(err));
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return `Timeout after ${TIMEOUT_MS}ms`;
    return err.message;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\nVerifying deployment: ${DEPLOY_URL}\n`);

  await checkHealth();
  await checkWebhook();
  await checkWebhookBadSignature();
  await checkStats();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
