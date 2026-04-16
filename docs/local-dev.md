# Local Development Guide

Run PullMatch locally and test the full webhook flow without deploying.

## Prerequisites

- Node.js >= 22
- pnpm
- (Optional) [ngrok](https://ngrok.com) — only needed to receive real GitHub webhooks

## 1. Set up environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | Yes | Any string — must match what you configure in GitHub |
| `GITHUB_TOKEN_WRITE` | For local testing | A GitHub PAT with `repo` scope for the test repo |
| `GITHUB_APP_ID` | For App auth | Your GitHub App's ID |
| `GITHUB_APP_PRIVATE_KEY` | For App auth | PEM-encoded private key (newlines as `\n`) |

For **local-only testing** (no real GitHub calls), you only need `GITHUB_WEBHOOK_SECRET`. Pick any value, e.g. `test-secret`.

## 2. Install dependencies

```bash
pnpm install
```

## 3. Start the API server

```bash
# Option A: using the dev script (from project root)
./scripts/dev-tunnel.sh

# Option B: directly via pnpm (from apps/api/)
cd apps/api && pnpm dev
```

The server starts on `http://localhost:3000` with file watching enabled.

## 4. Send a test webhook

In a separate terminal, from the project root:

```bash
./scripts/send-test-webhook.sh
```

This sends a mock `pull_request.opened` payload with a valid HMAC signature. You should see:

1. The script reports `HTTP 200`
2. The API server logs show `Webhook received` and pipeline execution

### Custom test parameters

```bash
./scripts/send-test-webhook.sh \
  --owner your-org \
  --repo your-repo \
  --pr 42 \
  --title "My test PR"
```

## 5. Test with real GitHub webhooks (optional)

To receive actual webhook deliveries from GitHub, use ngrok:

```bash
./scripts/dev-tunnel.sh --tunnel
```

This starts the API server **and** an ngrok tunnel. The script prints a tunnel URL like:

```
Webhook URL: https://abc123.ngrok-free.app/webhook
```

Set this URL as the webhook endpoint in your GitHub App settings (or repo webhook settings), then open a PR to trigger the full pipeline.

## 6. Verify the PR comment

If you configured a real `GITHUB_TOKEN_WRITE` (or App credentials) pointing at a test repo:

1. Open a pull request on that repo
2. PullMatch analyzes the PR and posts a reviewer suggestion comment
3. Push another commit to see the comment update (deduplication via `synchronize`)

## Troubleshooting

| Problem | Fix |
|---|---|
| `Webhook rejected (400)` | Ensure `GITHUB_WEBHOOK_SECRET` in `.env` matches the secret used by the test script or GitHub |
| `No GitHub token available — skipping` | Set `GITHUB_TOKEN_WRITE` or configure App credentials in `.env` |
| `ngrok not found` | Install ngrok: `brew install ngrok` (macOS) or `snap install ngrok` (Linux) |
| Server won't start | Check that port 3000 is free, or set `PORT=3001` in `.env` |
