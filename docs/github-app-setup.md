# GitHub App Setup for Local Development

This guide shows how to run the PullMatch webhook listener locally and receive real GitHub events using [smee.io](https://smee.io) as a proxy.

## Prerequisites

- Node.js 22+
- A GitHub account with permission to create GitHub Apps in an org or your personal account

---

## 1. Create a GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App** (or the org equivalent).
2. Fill in:
   - **GitHub App name**: `pullmatch-dev-<yourname>`
   - **Homepage URL**: `http://localhost:3000`
   - **Webhook URL**: _(fill in after step 2 below)_
   - **Webhook secret**: generate a random string, e.g. `openssl rand -hex 32`
3. Under **Subscribe to events**, check:
   - `Pull request`
4. Set **Repository permissions**:
   - `Pull requests` → Read-only
   - `Contents` → Read-only (needed to fetch file history)
5. Click **Create GitHub App**.
6. Note the **App ID** and download a **private key** (you'll need these later for authenticated API calls).

---

## 2. Set up smee.io as a webhook proxy

smee.io forwards GitHub webhook events to your localhost.

```bash
# Install the smee client globally
npm install -g smee-client

# Create a new channel at https://smee.io/new and copy the URL, then:
smee --url https://smee.io/<your-channel-id> --target http://localhost:3000/webhook
```

Paste the smee URL into your GitHub App's **Webhook URL** field and save.

---

## 3. Configure environment variables

Create `apps/api/.env` (never commit this file):

```env
GITHUB_WEBHOOK_SECRET=<the secret you set in the GitHub App>
PORT=3000
```

---

## 4. Start the API server

```bash
cd apps/api
npm run dev
```

You should see:

```
PullMatch API running on port 3000
```

---

## 5. Test it

1. Install your GitHub App on a test repository.
2. Open or push to a pull request in that repo.
3. GitHub sends the event → smee forwards it → your server logs the parsed payload:

```
[analysis] PR event queued for analysis: {
  "action": "opened",
  "repo": "yourorg/yourrepo",
  ...
}
```

---

## Webhook endpoint

```
POST /webhook
```

Accepts GitHub `pull_request` events (`opened`, `synchronize`).
Verifies the `X-Hub-Signature-256` HMAC signature before processing.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing X-Hub-Signature-256 header` | Make sure you set a Webhook secret in the GitHub App settings |
| `Webhook verification or processing failed` | Secret mismatch — check `GITHUB_WEBHOOK_SECRET` matches the GitHub App secret |
| Server not receiving events | Make sure smee is running and the Webhook URL is saved in the GitHub App |

---

## GitHub Marketplace Listing Metadata

Use these values when publishing the PullMatch GitHub App to the Marketplace.

### Short Description (~200 chars)

> PullMatch analyzes pull requests and recommends the best reviewers using commit history, code ownership, and recency — so the right people review every PR.

### Detailed Description (~1000 chars)

> PullMatch is the intelligence layer for code review. When a pull request is opened, PullMatch automatically analyzes changed files, builds a contributor graph from commit history, and scores potential reviewers based on four signals:
>
> - **Exact file commits** — who has directly worked on these files
> - **Directory commits** — who knows the surrounding codebase
> - **Recency** — who has been active recently (90-day decay)
> - **CODEOWNERS** — designated code owners get a scoring boost
>
> Results are posted as a clear, ranked PR comment with per-reviewer reasoning and domain expertise tags (Frontend, API, Database, DevOps, etc.).
>
> Configuration is optional — PullMatch works out of the box. Add a `.pullmatch.yml` to customize reviewer limits, enable auto-assignment, set up Slack notifications, or exclude specific paths.
>
> PullMatch is read-only: it never accesses source code content, only metadata and commit history. Free and open source under the MIT license.

### Categories

- Code Review
- Developer Tools

### Pricing

- Free (open source, MIT license)

### Screenshots (capture post-deployment)

1. **PR comment example** — A screenshot of a PullMatch reviewer suggestion comment on a real pull request, showing ranked reviewers with scores, domain tags, and context briefs.
2. **Config file example** — A screenshot of a `.pullmatch.yml` file in a repository showing common configuration options (reviewer limit, auto-assign, excluded paths).
3. **Installation flow** — A screenshot of the GitHub App install page showing the permissions requested (read-only pull requests and contents).
