#!/usr/bin/env bash
# plan-view.sh — Parse a plan.md Execution DAG into JSON and open in browser
# Usage: bash scripts/plan-view.sh <plan.md> [--results <results.md>]

set -euo pipefail

PLAN_FILE=""
RESULTS_FILE=""

# Parse arguments
NO_OPEN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --results)
      RESULTS_FILE="$2"
      shift 2
      ;;
    --no-open)
      NO_OPEN=1
      shift
      ;;
    *)
      PLAN_FILE="$1"
      shift
      ;;
  esac
done

if [[ -z "$PLAN_FILE" ]]; then
  echo "Usage: bash $0 <plan.md> [--results <results.md>]" >&2
  exit 1
fi

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "Error: plan file not found: $PLAN_FILE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../templates/plan-view.html"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Error: template not found: $TEMPLATE" >&2
  exit 1
fi

# ─── Extract plan metadata ────────────────────────────────────────────────────

PLAN_NAME=$(awk 'NR==1 && /^# Plan:/ { sub(/^# Plan: /, ""); print; exit }' "$PLAN_FILE")
PLAN_DATE=$(grep -m1 '_Generated on:' "$PLAN_FILE" | sed 's/.*_Generated on: \(.*\)_/\1/' || true)

# Fallbacks
[[ -z "$PLAN_NAME" ]] && PLAN_NAME="$(basename "$PLAN_FILE" .md)"
[[ -z "$PLAN_DATE" ]] && PLAN_DATE=""

# ─── JSON escape helper ───────────────────────────────────────────────────────

json_escape() {
  local s="$1"
  # Escape backslashes first, then double quotes, then control characters
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# ─── Parse Execution DAG from plan.md ────────────────────────────────────────

parse_dag() {
  local file="$1"
  awk '
    BEGIN { in_dag = 0; in_block = 0 }

    # Start of DAG section
    /^## Execution DAG/ { in_dag = 1; next }

    # End of DAG section: next --- or ## heading (but not ### inside)
    in_dag && /^---/ { in_dag = 0; next }
    in_dag && /^## / { in_dag = 0; next }

    # Skip code fences, HTML comments (start/end), empty fence markers
    in_dag && /^```/ { next }
    in_dag && /^<!--/ { next }
    in_dag && /^-->/ { next }

    # Collect lines within DAG
    in_dag { print }
  ' "$file"
}

# Build JSON array of task objects from DAG text
build_tasks_json() {
  local dag_text="$1"
  echo "$dag_text" | awk '
    BEGIN {
      task=""; title=""; depends_on=""; executor=""; isolation=""
      batch="0"; files=""; max_retries="0"; acceptance=""; requirements=""
      has_task=0
    }

    function flush_block(   t,ti,d,e,iso,b,f,mr,ac,rq) {
      if (!has_task) return
      t = task
      ti = (title == "") ? task : title
      d = depends_on
      e = executor
      iso = isolation
      b = (batch == "") ? "0" : batch
      f = files
      mr = (max_retries == "") ? "0" : max_retries
      ac = acceptance
      rq = requirements

      # Escape double quotes
      gsub(/"/, "\\\"", t)
      gsub(/"/, "\\\"", ti)
      gsub(/"/, "\\\"", d)
      gsub(/"/, "\\\"", e)
      gsub(/"/, "\\\"", iso)
      gsub(/"/, "\\\"", f)
      gsub(/"/, "\\\"", ac)
      gsub(/"/, "\\\"", rq)

      # Validate batch and max_retries are numeric
      if (b !~ /^[0-9]+$/) b = "0"
      if (mr !~ /^[0-9]+$/) mr = "0"

      print "TASK_START"
      print "{\"task\":\"" t "\",\"title\":\"" ti "\",\"depends_on\":\"" d "\",\"executor\":\"" e "\",\"isolation\":\"" iso "\",\"batch\":" b ",\"files\":\"" f "\",\"max_retries\":" mr ",\"acceptance\":\"" ac "\",\"requirements\":\"" rq "\"}"
    }

    /^$/ {
      flush_block()
      task=""; title=""; depends_on=""; executor=""; isolation=""
      batch="0"; files=""; max_retries="0"; acceptance=""; requirements=""
      has_task=0
      next
    }

    /^task:/ {
      has_task=1
      sub(/^task:[[:space:]]*/, "")
      task = $0
      next
    }
    /^title:/ { sub(/^title:[[:space:]]*/, ""); title = $0; next }
    /^depends_on:/ { sub(/^depends_on:[[:space:]]*/, ""); depends_on = $0; next }
    /^executor:/ { sub(/^executor:[[:space:]]*/, ""); executor = $0; next }
    /^isolation:/ { sub(/^isolation:[[:space:]]*/, ""); isolation = $0; next }
    /^batch:/ { sub(/^batch:[[:space:]]*/, ""); batch = $0; next }
    /^files:/ { sub(/^files:[[:space:]]*/, ""); files = $0; next }
    /^max_retries:/ { sub(/^max_retries:[[:space:]]*/, ""); max_retries = $0; next }
    /^acceptance:/ { sub(/^acceptance:[[:space:]]*/, ""); acceptance = $0; next }
    /^requirements:/ { sub(/^requirements:[[:space:]]*/, ""); requirements = $0; next }

    END { flush_block() }
  '
}

# ─── Parse Requirements section from plan.md ─────────────────────────────────

parse_requirements() {
  local file="$1"
  awk '
    BEGIN { in_req = 0 }
    /^## Requirements/ { in_req = 1; next }
    in_req && /^## / { in_req = 0; next }
    in_req && /^---/ { in_req = 0; next }
    in_req && /^- \*\*R[0-9]+:\*\*/ {
      id = $0; text = $0
      sub(/^- \*\*/, "", id); sub(/:.*/, "", id)
      sub(/^- \*\*R[0-9]+:\*\* */, "", text)
      gsub(/"/, "\\\"", text)
      print "REQ_START"
      print "{\"id\":\"" id "\",\"text\":\"" text "\"}"
    }
  ' "$file"
}

DAG_TEXT=$(parse_dag "$PLAN_FILE")
TASK_BLOCKS=$(build_tasks_json "$DAG_TEXT")

# Assemble JSON array from TASK_START-delimited blocks
TASKS_JSON="["
first_task=1
while IFS= read -r line; do
  if [[ "$line" == "TASK_START" ]]; then
    continue
  fi
  if [[ "$line" == {* ]]; then
    if [[ $first_task -eq 0 ]]; then
      TASKS_JSON+=","
    fi
    TASKS_JSON+="$line"
    first_task=0
  fi
done <<< "$TASK_BLOCKS"
TASKS_JSON+="]"

# Build requirements JSON array
REQ_BLOCKS=$(parse_requirements "$PLAN_FILE")
REQUIREMENTS_JSON="[]"
if [[ -n "$REQ_BLOCKS" ]]; then
  REQUIREMENTS_JSON="["
  first_req=1
  while IFS= read -r line; do
    if [[ "$line" == "REQ_START" ]]; then
      continue
    fi
    if [[ "$line" == {* ]]; then
      if [[ $first_req -eq 0 ]]; then
        REQUIREMENTS_JSON+=","
      fi
      REQUIREMENTS_JSON+="$line"
      first_req=0
    fi
  done <<< "$REQ_BLOCKS"
  REQUIREMENTS_JSON+="]"
fi

# ─── Parse results.md (optional) ─────────────────────────────────────────────

RESULTS_JSON="[]"

if [[ -n "$RESULTS_FILE" && -f "$RESULTS_FILE" ]]; then
  RESULTS_BLOCKS=$(awk '
    BEGIN { has_task=0; task=""; status=""; summary=""; files_changed=""; errors=""; validation_result="" }

    function flush_block() {
      if (!has_task) return
      t = task; st = status; sm = summary; fc = files_changed; er = errors; vr = validation_result
      gsub(/"/, "\\\"", t)
      gsub(/"/, "\\\"", st)
      gsub(/"/, "\\\"", sm)
      gsub(/"/, "\\\"", fc)
      gsub(/"/, "\\\"", er)
      gsub(/"/, "\\\"", vr)
      print "TASK_START"
      print "{\"task\":\"" t "\",\"status\":\"" st "\",\"summary\":\"" sm "\",\"files_changed\":\"" fc "\",\"errors\":\"" er "\",\"validation_result\":\"" vr "\"}"
    }

    /^$/ {
      flush_block()
      task=""; status=""; summary=""; files_changed=""; errors=""; validation_result=""
      has_task=0
      next
    }

    /^task:/ { has_task=1; sub(/^task:[[:space:]]*/, ""); task=$0; next }
    /^status:/ { sub(/^status:[[:space:]]*/, ""); status=$0; next }
    /^summary:/ { sub(/^summary:[[:space:]]*/, ""); summary=$0; next }
    /^files_changed:/ { sub(/^files_changed:[[:space:]]*/, ""); files_changed=$0; next }
    /^errors:/ { sub(/^errors:[[:space:]]*/, ""); errors=$0; next }
    /^validation_result:/ { sub(/^validation_result:[[:space:]]*/, ""); validation_result=$0; next }

    END { flush_block() }
  ' "$RESULTS_FILE")

  RESULTS_JSON="["
  first_result=1
  while IFS= read -r line; do
    if [[ "$line" == "TASK_START" ]]; then
      continue
    fi
    if [[ "$line" == {* ]]; then
      if [[ $first_result -eq 0 ]]; then
        RESULTS_JSON+=","
      fi
      RESULTS_JSON+="$line"
      first_result=0
    fi
  done <<< "$RESULTS_BLOCKS"
  RESULTS_JSON+="]"
fi

# ─── Build final JSON ─────────────────────────────────────────────────────────

PLAN_NAME_ESC=$(json_escape "$PLAN_NAME")
PLAN_DATE_ESC=$(json_escape "$PLAN_DATE")

PLAN_JSON="{\"name\":\"${PLAN_NAME_ESC}\",\"date\":\"${PLAN_DATE_ESC}\",\"tasks\":${TASKS_JSON},\"results\":${RESULTS_JSON},\"requirements\":${REQUIREMENTS_JSON}}"

# ─── Inject into HTML template ───────────────────────────────────────────────

# Derive stable output name from plan file path (reuses browser tab)
PLAN_DIR="$(dirname "$PLAN_FILE")"
PLAN_SLUG="$(basename "$(dirname "$PLAN_DIR")")-$(basename "$PLAN_DIR")"
OUTPUT="/tmp/plan-view-${PLAN_SLUG}.html"
JSON_TMP="/tmp/plan-view-json-${PLAN_SLUG}.json"

# Write JSON to temp file to avoid awk -v backslash-stripping issues
printf '%s' "$PLAN_JSON" > "$JSON_TMP"

# Replace __PLAN_DATA__ placeholder using Python (reliable, handles all chars)
python3 - "$TEMPLATE" "$JSON_TMP" "$OUTPUT" <<'PYEOF'
import sys

template_path = sys.argv[1]
json_path = sys.argv[2]
output_path = sys.argv[3]

with open(template_path, 'r') as f:
    template = f.read()

with open(json_path, 'r') as f:
    json_data = f.read()

result = template.replace('__PLAN_DATA__', json_data)

with open(output_path, 'w') as f:
    f.write(result)
PYEOF

rm -f "$JSON_TMP"

# ─── Open in browser and report ──────────────────────────────────────────────

if [[ $NO_OPEN -eq 0 ]]; then
  open "$OUTPUT"
fi
echo "$OUTPUT"
