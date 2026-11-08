#!/usr/bin/env bash
# Runs once when the Codespace (dev container) is created.
# Keep it idempotent: it may run again after a container rebuild.
set -euo pipefail

echo "== Toolchain =="
node --version
npm --version
gh --version | head -n 1
claude --version || echo "Claude Code CLI not found (check the devcontainer feature)."

echo "== Required secrets (values are never printed) =="
for var in MESHY_API_KEY OPENROUTER_API_KEY; do
  if [ -n "${!var:-}" ]; then
    echo "  ${var}: set"
  else
    echo "  ${var}: MISSING - add it as a Codespaces secret for this repository, then rebuild the container."
  fi
done

if [ -f package-lock.json ]; then
  echo "== Installing dependencies (npm ci) =="
  npm ci
  if grep -q '"@playwright/test"' package.json; then
    echo "== Installing Playwright Chromium for end-to-end tests =="
    npx playwright install --with-deps chromium
  fi
else
  echo "== No package-lock.json yet: the project has not been scaffolded (milestone M0). =="
fi

echo "Done. Start the agent with: claude"
