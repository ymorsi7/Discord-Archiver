#!/usr/bin/env sh
# Deploy to Fly.io. Run once: flyctl auth login
# Requires official Fly CLI: https://fly.io/docs/hover/ (brew install flyctl on Mac)

set -e
cd "$(dirname "$0")"

if ! command -v flyctl >/dev/null 2>&1; then
  echo "Install Fly CLI first:"
  echo "  Mac:   brew install flyctl"
  echo "  Other: curl -L https://fly.io/install.sh | sh"
  exit 1
fi

if [ -z "$DISCORD_TOKEN" ] && [ -f .env ]; then
  DISCORD_TOKEN=$(grep '^DISCORD_TOKEN=' .env | cut -d= -f2-)
fi
if [ -z "$DISCORD_TOKEN" ]; then
  echo "Set DISCORD_TOKEN in .env or: flyctl secrets set DISCORD_TOKEN=your_token"
  exit 1
fi

flyctl launch --no-deploy --yes 2>/dev/null || true
flyctl secrets set DISCORD_TOKEN="$DISCORD_TOKEN"
flyctl deploy
