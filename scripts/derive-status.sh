#!/usr/bin/env bash
# derive-status.sh — Shared helpers for deriving module status from filesystem artifacts.
# Source this file to get: frontmatter_field(), derive_status()
# No executable code at top level — safe to source from other scripts.

# ─── Frontmatter helper ───────────────────────────────────────────────────────

frontmatter_field() {
  local file="$1"
  local field="$2"
  awk -v field="$field" '
    NR==1 && /^---/ { in_fm=1; next }
    in_fm && /^---/ { exit }
    in_fm {
      key = $0
      sub(/:.*/, "", key)
      if (key == field) {
        sub(/^[^:]*:[[:space:]]*/, "")
        print
        exit
      }
    }
  ' "$file"
}

# ─── Derive status from filesystem artifacts ──────────────────────────────────
# Usage: derive_status <dir>
# Echoes one of: shipped | approved | building | done | planned | ready | exploring | seed | unknown
# Priority order: archived parent > review.md decision > results.md > plan.md > prd.md > cycles/ > draft.md > unknown

derive_status() {
  local dir="$1"

  # Strip trailing slash for dirname
  local parent
  parent=$(basename "$(dirname "${dir%/}")")
  if [[ "$parent" == "archived" ]]; then
    echo "shipped"
    return
  fi

  if [[ -f "$dir/review.md" ]] && grep -q "^decision: approved" "$dir/review.md" 2>/dev/null; then
    echo "approved"
    return
  fi

  if [[ -f "$dir/review.md" ]] && grep -q "^decision:" "$dir/review.md" 2>/dev/null; then
    echo "building"
    return
  fi

  if [[ -f "$dir/results.md" ]]; then
    local total_r not_done_r
    total_r=$(grep -c "^status:" "$dir/results.md" 2>/dev/null || true)
    not_done_r=$(grep "^status:" "$dir/results.md" 2>/dev/null | grep -cv "^status: \(success\|partial\)" || true)
    if [[ "$total_r" -gt 0 && "$not_done_r" -eq 0 ]]; then
      echo "done"
    else
      echo "building"
    fi
    return
  fi

  if [[ -f "$dir/plan.md" ]]; then
    echo "planned"
    return
  fi

  if [[ -f "$dir/prd.md" ]]; then
    echo "ready"
    return
  fi

  if [[ -d "$dir/cycles" ]]; then
    echo "exploring"
    return
  fi

  if [[ -f "$dir/draft.md" ]]; then
    echo "seed"
    return
  fi

  echo "unknown"
}
