#!/usr/bin/env bash
# Start the PullMatch API server locally, with an optional ngrok tunnel
# for receiving real GitHub webhook deliveries.
#
# Usage:
#   ./scripts/dev-tunnel.sh           # API only (localhost:3000)
#   ./scripts/dev-tunnel.sh --tunnel  # API + ngrok tunnel
#
# Prerequisites:
#   - Copy apps/api/.env.example to apps/api/.env and fill in values
#   - For --tunnel: install ngrok (https://ngrok.com) and authenticate

set -euo pipefail

PORT="${PORT:-3000}"
USE_TUNNEL=false

for arg in "$@"; do
  case "$arg" in
    --tunnel) USE_TUNNEL=true ;;
    --port=*) PORT="${arg#--port=}" ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# Ensure .env exists
if [ ! -f apps/api/.env ]; then
  echo "ERROR: apps/api/.env not found."
  echo "Copy apps/api/.env.example to apps/api/.env and fill in your values."
  exit 1
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  # Kill all background jobs in this process group
  kill 0 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting PullMatch API on port $PORT..."
cd apps/api
PORT="$PORT" node --env-file=.env --experimental-strip-types --watch src/index.ts &
API_PID=$!
cd ../..

# Give the server a moment to start
sleep 2

if [ "$USE_TUNNEL" = true ]; then
  if ! command -v ngrok &>/dev/null; then
    echo "ERROR: ngrok is not installed. Install it from https://ngrok.com"
    echo "  brew install ngrok   # macOS"
    echo "  snap install ngrok   # Linux"
    exit 1
  fi

  echo "Starting ngrok tunnel to localhost:$PORT..."
  ngrok http "$PORT" --log=stdout &
  NGROK_PID=$!

  # Wait for ngrok to establish the tunnel and print the URL
  sleep 3
  TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

  if [ -n "$TUNNEL_URL" ]; then
    echo ""
    echo "============================================"
    echo "  Tunnel URL: $TUNNEL_URL"
    echo "  Webhook URL: $TUNNEL_URL/webhook"
    echo "============================================"
    echo ""
    echo "Set this as your GitHub App webhook URL."
  else
    echo "WARNING: Could not detect ngrok tunnel URL."
    echo "Check http://localhost:4040 for the ngrok dashboard."
  fi
fi

echo "Press Ctrl+C to stop."
wait
