# Deploy PullMatch with Docker

Run PullMatch anywhere Docker is available — no Fly.io CLI required.

## Prerequisites

- Docker 20+ and Docker Compose v2
- GitHub App credentials (see [Getting Started](./getting-started.md))

## Quick Start

1. **Clone the repo and configure environment:**

   ```bash
   git clone https://github.com/your-org/pullmatch.git
   cd pullmatch
   cp .env.example .env
   ```

2. **Edit `.env`** with your GitHub App credentials:

   ```env
   PORT=3000
   GITHUB_APP_ID=123456
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   GITHUB_WEBHOOK_SECRET=your-webhook-secret
   ```

   > **Tip:** For multi-line private keys, either use `\n` escapes in a quoted string or mount the key as a file and reference it in your compose override.

3. **Build and run:**

   ```bash
   docker compose up -d
   ```

4. **Verify health:**

   ```bash
   curl http://localhost:3000/health
   # {"status":"ok","version":"1.2.0",...}
   ```

## Build Manually

```bash
docker build -t pullmatch .
docker run -p 3000:3000 --env-file .env pullmatch
```

## Environment Variables

| Variable                 | Required | Description                                           |
| ------------------------ | -------- | ----------------------------------------------------- |
| `GITHUB_APP_ID`          | Yes*     | GitHub App ID                                         |
| `GITHUB_APP_PRIVATE_KEY` | Yes*     | GitHub App private key (PEM)                          |
| `GITHUB_WEBHOOK_SECRET`  | Yes      | Webhook secret configured in GitHub App settings      |
| `GITHUB_TOKEN_WRITE`     | Yes*     | Fallback: personal access token (if no App credentials) |
| `PORT`                   | No       | Server port (default: 3000)                           |
| `NODE_ENV`               | No       | Environment (default: production)                     |

*Either `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` **or** `GITHUB_TOKEN_WRITE` must be set.

## Deploy to a VPS

Any VPS that runs Docker works. Here are a few common options:

### DigitalOcean / Generic VPS

```bash
ssh your-server
git clone https://github.com/your-org/pullmatch.git
cd pullmatch
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

Set your GitHub App webhook URL to `https://your-server-domain:3000/webhook` (use a reverse proxy like Caddy or nginx for HTTPS).

### Railway

Railway detects the `Dockerfile` automatically:

1. Connect your GitHub repo to Railway
2. Set the environment variables in Railway's dashboard
3. Deploy — Railway builds and runs the container
4. Use the Railway-provided URL as your webhook endpoint

### Render

1. Create a new **Web Service** from your GitHub repo
2. Render detects the `Dockerfile`
3. Set environment variables in the Render dashboard
4. The health check at `/health` works out of the box

## Updating

```bash
git pull origin main
docker compose up -d --build
```

## Troubleshooting

- **Container exits immediately:** Check logs with `docker compose logs api`. Usually means missing environment variables.
- **Health check failing:** Ensure `GITHUB_WEBHOOK_SECRET` is set and at least one auth method is configured.
- **Webhook not received:** Verify your GitHub App webhook URL points to this server's public address on port 3000.
