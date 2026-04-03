#!/usr/bin/env bash
# Send a mock pull_request.opened webhook to the local PullMatch API.
# Computes a valid HMAC-SHA256 signature using your GITHUB_WEBHOOK_SECRET.
#
# Usage:
#   ./scripts/send-test-webhook.sh                    # defaults
#   ./scripts/send-test-webhook.sh --url http://localhost:3000/webhook
#   ./scripts/send-test-webhook.sh --owner myorg --repo myrepo --pr 42
#
# Prerequisites:
#   - GITHUB_WEBHOOK_SECRET env var set (or present in apps/api/.env)
#   - openssl and curl installed

set -euo pipefail

# Defaults
WEBHOOK_URL="http://localhost:3000/webhook"
OWNER="test-org"
REPO="test-repo"
PR_NUMBER=1
PR_TITLE="Test PR for local development"
PR_AUTHOR="test-user"
BRANCH="feature/test"
BASE_BRANCH="main"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) WEBHOOK_URL="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --pr) PR_NUMBER="$2"; shift 2 ;;
    --title) PR_TITLE="$2"; shift 2 ;;
    --author) PR_AUTHOR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# Load GITHUB_WEBHOOK_SECRET from env or .env file
if [ -z "${GITHUB_WEBHOOK_SECRET:-}" ]; then
  if [ -f apps/api/.env ]; then
    GITHUB_WEBHOOK_SECRET=$(grep -E '^GITHUB_WEBHOOK_SECRET=' apps/api/.env | cut -d'=' -f2- | tr -d "'" | tr -d '"')
  fi
fi

if [ -z "${GITHUB_WEBHOOK_SECRET:-}" ]; then
  echo "ERROR: GITHUB_WEBHOOK_SECRET is not set."
  echo "Either export it or add it to apps/api/.env"
  exit 1
fi

SHA="$(openssl rand -hex 20)"
DELIVERY_ID="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo test-delivery-$(date +%s))"

# Build the webhook payload
PAYLOAD=$(cat <<EOF
{
  "action": "opened",
  "number": ${PR_NUMBER},
  "pull_request": {
    "number": ${PR_NUMBER},
    "title": "${PR_TITLE}",
    "user": { "login": "${PR_AUTHOR}" },
    "head": { "ref": "${BRANCH}", "sha": "${SHA}" },
    "base": { "ref": "${BASE_BRANCH}" },
    "diff_url": "https://github.com/${OWNER}/${REPO}/pull/${PR_NUMBER}.diff",
    "html_url": "https://github.com/${OWNER}/${REPO}/pull/${PR_NUMBER}"
  },
  "repository": {
    "full_name": "${OWNER}/${REPO}",
    "name": "${REPO}",
    "owner": { "login": "${OWNER}" }
  }
}
EOF
)

# Compute HMAC-SHA256 signature
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | sed 's/^.* //')"

echo "Sending test webhook to $WEBHOOK_URL"
echo "  Event: pull_request.opened"
echo "  Repo:  ${OWNER}/${REPO}#${PR_NUMBER}"
echo "  Delivery: $DELIVERY_ID"
echo ""

HTTP_CODE=$(curl -s -o /tmp/pullmatch-webhook-response.json -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: $DELIVERY_ID" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$PAYLOAD")

RESPONSE=$(cat /tmp/pullmatch-webhook-response.json 2>/dev/null || echo "(no response body)")

echo "Response: HTTP $HTTP_CODE"
echo "$RESPONSE"

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "Webhook accepted. Check the API server logs for pipeline output."
else
  echo ""
  echo "Webhook rejected. Verify your GITHUB_WEBHOOK_SECRET matches the server."
  exit 1
fi
