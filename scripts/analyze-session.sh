#!/usr/bin/env bash
# analyze-session.sh — Analyze a Claude Code session transcript
# Usage:
#   analyze-session.sh <session-id> [--project <encoded-path>]
#   analyze-session.sh <path-to-file.jsonl>
#   analyze-session.sh --summary [--last N] [--project <encoded-path>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANALYZER="$SCRIPT_DIR/session_analyzer.py"

if [[ ! -f "$ANALYZER" ]]; then
  echo "Error: session_analyzer.py not found at $ANALYZER" >&2
  exit 1
fi

# ─── Argument parsing ─────────────────────────────────────────────────────────

SESSION=""
PROJECT=""
SUMMARY=0
LAST=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --summary)
      SUMMARY=1
      shift
      ;;
    --last)
      LAST="$2"
      shift 2
      ;;
    --*)
      EXTRA_ARGS+=("$1")
      shift
      ;;
    *)
      SESSION="$1"
      shift
      ;;
  esac
done

# ─── Build python command ─────────────────────────────────────────────────────

PYTHON_ARGS=()

if [[ $SUMMARY -eq 1 ]]; then
  PYTHON_ARGS+=("--summary")
elif [[ -z "$SESSION" ]]; then
  echo "Usage: analyze-session.sh <session-id> [--project <encoded-path>]" >&2
  echo "       analyze-session.sh --summary [--project <encoded-path>]" >&2
  exit 1
else
  PYTHON_ARGS+=("$SESSION")
fi

if [[ -n "$PROJECT" ]]; then
  PYTHON_ARGS+=("--project" "$PROJECT")
fi

if [[ -n "$LAST" ]]; then
  PYTHON_ARGS+=("--last" "$LAST")
fi

# Pass through any extra flags
PYTHON_ARGS+=("${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")

# ─── Execute ──────────────────────────────────────────────────────────────────

exec python3 "$ANALYZER" "${PYTHON_ARGS[@]}"
