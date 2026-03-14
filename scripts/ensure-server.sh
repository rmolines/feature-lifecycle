#!/usr/bin/env bash
# Ensures the workspace HTTP server is running on port 3333.
# Usage: source this script or call it before opening views.
#   bash scripts/ensure-server.sh        → starts if not running, prints URL
#   bash scripts/ensure-server.sh --port 3334  → custom port

set -euo pipefail

PORT="${1:-3333}"
if [ "${1:-}" = "--port" ]; then PORT="${2:-3333}"; fi

LAUNCHPAD_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
  echo "http://localhost:${PORT}"
  exit 0
fi

# Start server in background
nohup "${HOME}/.bun/bin/bun" "${LAUNCHPAD_ROOT}/src/serve.ts" \
  >/dev/null 2>"${LAUNCHPAD_ROOT}/.server.log" &

# Wait for it to be ready (up to 3s)
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo "http://localhost:${PORT}"
    exit 0
  fi
  sleep 0.2
done

echo "Failed to start workspace server on port ${PORT}" >&2
exit 1
