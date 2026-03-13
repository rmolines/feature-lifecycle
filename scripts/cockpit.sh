#!/usr/bin/env bash
# cockpit.sh — Scan ~/.claude/discoveries/, build unified JSON, inject into HTML template
# Usage:
#   bash scripts/cockpit.sh                          # scan all, open browser
#   bash scripts/cockpit.sh --project <alias>        # filter by project
#   bash scripts/cockpit.sh --json-only              # print JSON to stdout

set -euo pipefail

FILTER_PROJECT=""
JSON_ONLY=0
DISCOVERIES_DIR="${HOME}/.claude/discoveries"

# ─── Argument parsing ─────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      FILTER_PROJECT="$2"
      shift 2
      ;;
    --json-only)
      JSON_ONLY=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--project <alias>] [--json-only]" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../templates/cockpit.html"

# ─── Shared helpers ───────────────────────────────────────────────────────────

# shellcheck source=derive-status.sh
source "$SCRIPT_DIR/derive-status.sh"

# ─── JSON escape helper ───────────────────────────────────────────────────────

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# ─── Parse Execution DAG from plan.md ─────────────────────────────────────────

parse_dag() {
  local file="$1"
  awk '
    BEGIN { in_dag = 0 }
    /^## Execution DAG/ { in_dag = 1; next }
    in_dag && /^---/ { in_dag = 0; next }
    in_dag && /^## / { in_dag = 0; next }
    in_dag && /^```/ { next }
    in_dag && /^<!--/ { next }
    in_dag && /^-->/ { next }
    in_dag { print }
  ' "$file"
}

build_tasks_json() {
  local dag_text="$1"
  echo "$dag_text" | awk '
    BEGIN {
      task=""; title=""; depends_on=""; executor=""; isolation=""
      batch="0"; files=""; max_retries="0"; acceptance=""
      has_task=0
    }

    function json_safe(s) {
      gsub(/\\/, "\\\\", s)
      gsub(/"/, "\\\"", s)
      return s
    }

    function flush_block(   t,ti,d,e,iso,b,f,mr,ac) {
      if (!has_task) return
      t = json_safe(task); ti = json_safe((title == "") ? task : title)
      d = json_safe(depends_on); e = json_safe(executor); iso = json_safe(isolation)
      b = (batch == "") ? "0" : batch
      f = json_safe(files); mr = (max_retries == "") ? "0" : max_retries
      ac = json_safe(acceptance)
      if (b !~ /^[0-9]+$/) b = "0"
      if (mr !~ /^[0-9]+$/) mr = "0"
      print "TASK_START"
      print "{\"task\":\"" t "\",\"title\":\"" ti "\",\"depends_on\":\"" d "\",\"executor\":\"" e "\",\"isolation\":\"" iso "\",\"batch\":" b ",\"files\":\"" f "\",\"max_retries\":" mr ",\"acceptance\":\"" ac "\"}"
    }

    /^$/ { flush_block(); task=""; title=""; depends_on=""; executor=""; isolation=""; batch="0"; files=""; max_retries="0"; acceptance=""; has_task=0; next }
    /^task:/        { has_task=1; sub(/^task:[[:space:]]*/, ""); task=$0; next }
    /^title:/       { sub(/^title:[[:space:]]*/, ""); title=$0; next }
    /^depends_on:/  { sub(/^depends_on:[[:space:]]*/, ""); depends_on=$0; next }
    /^executor:/    { sub(/^executor:[[:space:]]*/, ""); executor=$0; next }
    /^isolation:/   { sub(/^isolation:[[:space:]]*/, ""); isolation=$0; next }
    /^batch:/       { sub(/^batch:[[:space:]]*/, ""); batch=$0; next }
    /^files:/       { sub(/^files:[[:space:]]*/, ""); files=$0; next }
    /^max_retries:/ { sub(/^max_retries:[[:space:]]*/, ""); max_retries=$0; next }
    /^acceptance:/  { sub(/^acceptance:[[:space:]]*/, ""); acceptance=$0; next }
    END { flush_block() }
  '
}

assemble_tasks_json() {
  local blocks="$1"
  local json="["
  local first=1
  while IFS= read -r line; do
    [[ "$line" == "TASK_START" ]] && continue
    if [[ "$line" == \{* ]]; then
      [[ $first -eq 0 ]] && json+=","
      json+="$line"
      first=0
    fi
  done <<< "$blocks"
  json+="]"
  printf '%s' "$json"
}

# ─── Parse results.md ─────────────────────────────────────────────────────────

parse_results_json() {
  local file="$1"
  local blocks
  blocks=$(awk '
    BEGIN { has_task=0; task=""; status=""; summary=""; files_changed=""; errors=""; validation_result="" }

    function json_safe(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }

    function flush_block() {
      if (!has_task) return
      t=json_safe(task); st=json_safe(status); sm=json_safe(summary)
      fc=json_safe(files_changed); er=json_safe(errors); vr=json_safe(validation_result)
      print "TASK_START"
      print "{\"task\":\"" t "\",\"status\":\"" st "\",\"summary\":\"" sm "\",\"files_changed\":\"" fc "\",\"errors\":\"" er "\",\"validation_result\":\"" vr "\"}"
    }

    /^$/ { flush_block(); task=""; status=""; summary=""; files_changed=""; errors=""; validation_result=""; has_task=0; next }
    /^task:/              { has_task=1; sub(/^task:[[:space:]]*/, ""); task=$0; next }
    /^status:/            { sub(/^status:[[:space:]]*/, ""); status=$0; next }
    /^summary:/           { sub(/^summary:[[:space:]]*/, ""); summary=$0; next }
    /^files_changed:/     { sub(/^files_changed:[[:space:]]*/, ""); files_changed=$0; next }
    /^errors:/            { sub(/^errors:[[:space:]]*/, ""); errors=$0; next }
    /^validation_result:/ { sub(/^validation_result:[[:space:]]*/, ""); validation_result=$0; next }
    END { flush_block() }
  ' "$file")

  assemble_tasks_json "$blocks"
}

# ─── Frontmatter helpers ──────────────────────────────────────────────────────
# frontmatter_field() is provided by derive-status.sh (sourced above)

# Parse tags: `tags: [ui, cockpit]` → `["ui","cockpit"]`
parse_tags() {
  local raw="$1"
  raw="${raw#\[}"
  raw="${raw%\]}"
  if [[ -z "$raw" ]]; then
    printf '[]'
    return
  fi
  local json="["
  local first=1
  IFS=',' read -ra parts <<< "$raw"
  for part in "${parts[@]}"; do
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    [[ -z "$part" ]] && continue
    [[ $first -eq 0 ]] && json+=","
    json+="\"$(json_escape "$part")\""
    first=0
  done
  json+="]"
  printf '%s' "$json"
}

# Extract first non-empty paragraph after "## Problem"
extract_problem() {
  local file="$1"
  awk '
    /^## Problem/ { found=1; next }
    found && /^## / { exit }
    found && /^---/ { exit }
    found && NF > 0 { print; exit }
  ' "$file"
}

# determine_phase() replaced by derive_status() from derive-status.sh (sourced above)

# ─── Project counter helpers (bash 3 compatible, no associative arrays) ───────
# We store counts in temp files: /tmp/cockpit_proj_<project>_{draft,final,archived}

COUNTER_DIR="/tmp/cockpit_counters_$$"
mkdir -p "$COUNTER_DIR"
# Ensure cleanup on exit
trap 'rm -rf "$COUNTER_DIR"' EXIT

proj_counter_file() {
  local proj="$1"
  local kind="$2"
  # sanitize project name for filename
  local safe="${proj//\//_}"
  echo "$COUNTER_DIR/${safe}_${kind}"
}

proj_counter_inc() {
  local proj="$1"
  local kind="$2"
  local f
  f=$(proj_counter_file "$proj" "$kind")
  local cur=0
  [[ -f "$f" ]] && cur=$(cat "$f")
  echo $(( cur + 1 )) > "$f"
}

proj_counter_get() {
  local proj="$1"
  local kind="$2"
  local f
  f=$(proj_counter_file "$proj" "$kind")
  if [[ -f "$f" ]]; then cat "$f"; else echo 0; fi
}

# Track unique project names in a file
PROJECTS_LIST_FILE="$COUNTER_DIR/projects_seen"
touch "$PROJECTS_LIST_FILE"

proj_register() {
  local proj="$1"
  if ! grep -qxF "$proj" "$PROJECTS_LIST_FILE" 2>/dev/null; then
    echo "$proj" >> "$PROJECTS_LIST_FILE"
  fi
}

# ─── Main scanning loop ───────────────────────────────────────────────────────

INITIATIVES_JSON=""
PLANS_JSON=""
first_initiative=1
first_plan=1

for feature_dir in "$DISCOVERIES_DIR"/*/*/; do
  [[ -d "$feature_dir" ]] || continue

  parent_dir="${feature_dir%/}"
  feature=$(basename "$parent_dir")
  project=$(basename "$(dirname "$parent_dir")")

  # Determine primary frontmatter source
  fm_file=""
  if [[ -f "$feature_dir/prd.md" ]]; then
    fm_file="$feature_dir/prd.md"
  elif [[ -f "$feature_dir/draft.md" ]]; then
    fm_file="$feature_dir/draft.md"
  fi

  if [[ -n "$fm_file" ]]; then
    fm_id=$(frontmatter_field "$fm_file" "id")
    fm_project=$(frontmatter_field "$fm_file" "project")
    fm_created=$(frontmatter_field "$fm_file" "created")
    fm_updated=$(frontmatter_field "$fm_file" "updated")
    fm_tags_raw=$(frontmatter_field "$fm_file" "tags")
  else
    fm_id=""; fm_project=""; fm_created=""; fm_updated=""; fm_tags_raw=""
  fi

  [[ -z "$fm_id" ]]      && fm_id="$feature"
  [[ -z "$fm_project" ]] && fm_project="$project"

  eff_project="$fm_project"

  # Apply project filter using authoritative frontmatter value
  if [[ -n "$FILTER_PROJECT" && "$eff_project" != "$FILTER_PROJECT" ]]; then
    continue
  fi

  tags_json=$(parse_tags "$fm_tags_raw")

  # Artifact presence
  has_draft=false;   [[ -f "$feature_dir/draft.md" ]] && has_draft=true
  has_cycles=false;  [[ -d "$feature_dir/cycles" ]] && has_cycles=true
  has_prd=false;     [[ -f "$feature_dir/prd.md" ]] && has_prd=true
  has_plan=false;    [[ -f "$feature_dir/plan.md" ]] && has_plan=true
  has_results=false; [[ -f "$feature_dir/results.md" ]] && has_results=true
  has_review=false;  [[ -f "$feature_dir/review.md" ]] && has_review=true

  phase=$(derive_status "$feature_dir")

  cycle_count=0
  [[ "$has_cycles" == "true" ]] && cycle_count=$(ls "$feature_dir/cycles" 2>/dev/null | wc -l | tr -d ' ')

  problem=""
  [[ -n "$fm_file" ]] && problem=$(extract_problem "$fm_file")

  results_summary=null
  if [[ -f "$feature_dir/results.md" ]]; then
    total_r=$(grep -c "^status:" "$feature_dir/results.md" 2>/dev/null || true)
    success_r=$(grep -c "^status: success" "$feature_dir/results.md" 2>/dev/null || true)
    partial_r=$(grep -c "^status: partial" "$feature_dir/results.md" 2>/dev/null || true)
    failed_r=$(grep -c "^status: failed" "$feature_dir/results.md" 2>/dev/null || true)
    results_summary="\"$(json_escape "${success_r} success, ${partial_r} partial, ${failed_r} failed of ${total_r} tasks")\""
  fi

  review_decision=null
  if [[ -f "$feature_dir/review.md" ]]; then
    rd=$(grep -m1 "^decision:" "$feature_dir/review.md" 2>/dev/null | sed 's/^decision:[[:space:]]*//' || true)
    [[ -n "$rd" ]] && review_decision="\"$(json_escape "$rd")\""
  fi

  # Register project and accumulate counts
  proj_register "$eff_project"
  case "$phase" in
    seed|exploring)                       proj_counter_inc "$eff_project" "draft" ;;
    ready|planned|building|done|approved) proj_counter_inc "$eff_project" "final" ;;
    shipped)                              proj_counter_inc "$eff_project" "archived" ;;
    *)                                    proj_counter_inc "$eff_project" "draft" ;;
  esac

  # Build initiative JSON object
  id_esc=$(json_escape "$fm_id")
  proj_esc=$(json_escape "$eff_project")
  phase_esc=$(json_escape "$phase")
  created_esc=$(json_escape "${fm_created:-}")
  updated_esc=$(json_escape "${fm_updated:-}")
  problem_esc=$(json_escape "$problem")

  initiative_obj="{\"id\":\"${id_esc}\",\"project\":\"${proj_esc}\",\"status\":\"${phase_esc}\",\"phase\":\"${phase_esc}\",\"tags\":${tags_json},\"created\":\"${created_esc}\",\"updated\":\"${updated_esc}\",\"artifacts\":{\"draft\":${has_draft},\"cycles\":${has_cycles},\"prd\":${has_prd},\"plan\":${has_plan},\"results\":${has_results},\"review\":${has_review}},\"cycle_count\":${cycle_count},\"results_summary\":${results_summary},\"review_decision\":${review_decision},\"problem\":\"${problem_esc}\"}"

  if [[ $first_initiative -eq 0 ]]; then
    INITIATIVES_JSON+=","
  fi
  INITIATIVES_JSON+="$initiative_obj"
  first_initiative=0

  # Parse plan if it exists
  if [[ -f "$feature_dir/plan.md" ]]; then
    plan_name=$(awk 'NR==1 && /^# Plan:/ { sub(/^# Plan: /, ""); print; exit }' "$feature_dir/plan.md")
    plan_date=$(grep -m1 '_Generated on:' "$feature_dir/plan.md" | sed 's/.*_Generated on: \(.*\)_/\1/' || true)
    [[ -z "$plan_name" ]] && plan_name="$fm_id"
    [[ -z "$plan_date" ]] && plan_date=""

    dag_text=$(parse_dag "$feature_dir/plan.md")
    task_blocks=$(build_tasks_json "$dag_text")
    tasks_json=$(assemble_tasks_json "$task_blocks")

    results_arr_json="[]"
    if [[ -f "$feature_dir/results.md" ]]; then
      results_arr_json=$(parse_results_json "$feature_dir/results.md")
    fi

    plan_name_esc=$(json_escape "$plan_name")
    plan_date_esc=$(json_escape "$plan_date")

    plan_obj="{\"project\":\"${proj_esc}\",\"feature\":\"${id_esc}\",\"name\":\"${plan_name_esc}\",\"date\":\"${plan_date_esc}\",\"tasks\":${tasks_json},\"results\":${results_arr_json}}"

    if [[ $first_plan -eq 0 ]]; then
      PLANS_JSON+=","
    fi
    PLANS_JSON+="$plan_obj"
    first_plan=0
  fi
done

# ─── Build projects aggregation ───────────────────────────────────────────────

PROJECTS_JSON=""
first_project=1

while IFS= read -r proj; do
    [[ -z "$proj" ]] && continue
    draft_c=$(proj_counter_get "$proj" "draft")
    final_c=$(proj_counter_get "$proj" "final")
    archived_c=$(proj_counter_get "$proj" "archived")
    total_c=$(( draft_c + final_c + archived_c ))
    proj_esc=$(json_escape "$proj")

    project_obj="{\"id\":\"${proj_esc}\",\"initiative_counts\":{\"draft\":${draft_c},\"final\":${final_c},\"archived\":${archived_c}},\"total\":${total_c}}"

    if [[ $first_project -eq 0 ]]; then
      PROJECTS_JSON+=","
    fi
    PROJECTS_JSON+="$project_obj"
    first_project=0
done < "$PROJECTS_LIST_FILE"

# ─── Assemble final JSON ──────────────────────────────────────────────────────

GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S")

if [[ -n "$FILTER_PROJECT" ]]; then
  FILTER_VAL="\"$(json_escape "$FILTER_PROJECT")\""
else
  FILTER_VAL="null"
fi

FINAL_JSON="{\"generated_at\":\"${GENERATED_AT}\",\"filter_project\":${FILTER_VAL},\"projects\":[${PROJECTS_JSON}],\"initiatives\":[${INITIATIVES_JSON}],\"plans\":[${PLANS_JSON}]}"

# ─── Output ───────────────────────────────────────────────────────────────────

if [[ $JSON_ONLY -eq 1 ]]; then
  printf '%s\n' "$FINAL_JSON"
  exit 0
fi

# Inject into HTML template
if [[ ! -f "$TEMPLATE" ]]; then
  echo "Error: template not found: $TEMPLATE" >&2
  exit 1
fi

TIMESTAMP=$(date +%s)
OUTPUT="/tmp/cockpit-${TIMESTAMP}.html"
JSON_TMP="/tmp/cockpit-json-${TIMESTAMP}.json"

printf '%s' "$FINAL_JSON" > "$JSON_TMP"

python3 - "$TEMPLATE" "$JSON_TMP" "$OUTPUT" <<'PYEOF'
import sys

template_path = sys.argv[1]
json_path     = sys.argv[2]
output_path   = sys.argv[3]

with open(template_path, 'r') as f:
    template = f.read()

with open(json_path, 'r') as f:
    json_data = f.read()

result = template.replace('__COCKPIT_DATA__', json_data)

with open(output_path, 'w') as f:
    f.write(result)
PYEOF

rm -f "$JSON_TMP"

open "$OUTPUT"
echo "$OUTPUT"
