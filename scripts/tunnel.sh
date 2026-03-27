#!/usr/bin/env bash
# Start a localtunnel to expose the local PullMatch API for webhook delivery.
# Usage: ./scripts/tunnel.sh [port]
#
# The tunnel URL should be set as the GitHub App webhook URL:
#   https://<subdomain>.loca.lt/webhook

set -euo pipefail

PORT="${1:-3000}"

echo "Starting localtunnel on port $PORT..."
npx -y localtunnel --port "$PORT"
