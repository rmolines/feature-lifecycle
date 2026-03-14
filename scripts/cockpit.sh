#!/usr/bin/env bash
# cockpit.sh — Scan ~/.claude/initiatives/, build unified JSON, inject into HTML template
# Usage:
#   bash scripts/cockpit.sh                          # scan all, open browser
#   bash scripts/cockpit.sh --mission <alias>        # filter by mission
#   bash scripts/cockpit.sh --json-only              # print JSON to stdout
#   bash scripts/cockpit.sh --refresh                # generate JSON + cockpit.md + HTML

set -euo pipefail

FILTER_MISSION=""
JSON_ONLY=0
REFRESH=0
INITIATIVES_DIR="${HOME}/.claude/initiatives"

# ─── Argument parsing ─────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mission|--project)
      FILTER_MISSION="$2"
      shift 2
      ;;
    --json-only)
      JSON_ONLY=1
      shift
      ;;
    --refresh)
      REFRESH=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--mission <alias>] [--json-only] [--refresh]" >&2
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

# nullable_json <value> — prints JSON string or null
nullable_json() {
  if [[ -n "$1" ]]; then printf '"%s"' "$(json_escape "$1")"; else printf 'null'; fi
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

MODULES_JSON=""
PLANS_JSON=""
first_module=1
first_plan=1

for feature_dir in "$INITIATIVES_DIR"/*/*/; do
  [[ -d "$feature_dir" ]] || continue

  parent_dir="${feature_dir%/}"
  feature=$(basename "$parent_dir")
  mission=$(basename "$(dirname "$parent_dir")")

  # Determine primary frontmatter source
  fm_file=""
  if [[ -f "$feature_dir/prd.md" ]]; then
    fm_file="$feature_dir/prd.md"
  elif [[ -f "$feature_dir/draft.md" ]]; then
    fm_file="$feature_dir/draft.md"
  fi

  if [[ -n "$fm_file" ]]; then
    fm_id=$(frontmatter_field "$fm_file" "id")
    fm_mission=$(frontmatter_field "$fm_file" "mission")
    fm_created=$(frontmatter_field "$fm_file" "created")
    fm_updated=$(frontmatter_field "$fm_file" "updated")
    fm_tags_raw=$(frontmatter_field "$fm_file" "tags")
  else
    fm_id=""; fm_mission=""; fm_created=""; fm_updated=""; fm_tags_raw=""
  fi

  [[ -z "$fm_id" ]]      && fm_id="$feature"
  [[ -z "$fm_mission" ]] && fm_mission="$mission"

  eff_mission="$fm_mission"

  # Apply mission filter using authoritative frontmatter value
  if [[ -n "$FILTER_MISSION" && "$eff_mission" != "$FILTER_MISSION" ]]; then
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

  # Register mission and accumulate counts
  proj_register "$eff_mission"
  case "$phase" in
    seed|exploring)                       proj_counter_inc "$eff_mission" "draft" ;;
    ready|planned|building|done|approved) proj_counter_inc "$eff_mission" "final" ;;
    shipped)                              proj_counter_inc "$eff_mission" "archived" ;;
    *)                                    proj_counter_inc "$eff_mission" "draft" ;;
  esac

  # Build initiative JSON object
  id_esc=$(json_escape "$fm_id")
  proj_esc=$(json_escape "$eff_mission")
  phase_esc=$(json_escape "$phase")
  created_esc=$(json_escape "${fm_created:-}")
  updated_esc=$(json_escape "${fm_updated:-}")
  problem_esc=$(json_escape "$problem")

  module_obj="{\"id\":\"${id_esc}\",\"mission\":\"${proj_esc}\",\"status\":\"${phase_esc}\",\"phase\":\"${phase_esc}\",\"tags\":${tags_json},\"created\":\"${created_esc}\",\"updated\":\"${updated_esc}\",\"artifacts\":{\"draft\":${has_draft},\"cycles\":${has_cycles},\"prd\":${has_prd},\"plan\":${has_plan},\"results\":${has_results},\"review\":${has_review}},\"cycle_count\":${cycle_count},\"results_summary\":${results_summary},\"review_decision\":${review_decision},\"problem\":\"${problem_esc}\"}"

  if [[ $first_module -eq 0 ]]; then
    MODULES_JSON+=","
  fi
  MODULES_JSON+="$module_obj"
  first_module=0

  # Parse plan if it exists
  if [[ -f "$feature_dir/plan.md" ]]; then
    plan_name=$(awk 'NR==1 && /^# Plan:/ { sub(/^# Plan: /, ""); print; exit }' "$feature_dir/plan.md")
    plan_date=$(grep -m1 '_Generated on:' "$feature_dir/plan.md" | sed 's/.*_Generated on: \(.*\)_/\1/' || true)
    [[ -z "$plan_name" ]] && plan_name="$fm_id"

    dag_text=$(parse_dag "$feature_dir/plan.md")
    task_blocks=$(build_tasks_json "$dag_text")
    tasks_json=$(assemble_tasks_json "$task_blocks")

    results_arr_json="[]"
    if [[ -f "$feature_dir/results.md" ]]; then
      results_arr_json=$(parse_results_json "$feature_dir/results.md")
    fi

    plan_name_esc=$(json_escape "$plan_name")
    plan_date_esc=$(json_escape "$plan_date")

    plan_obj="{\"mission\":\"${proj_esc}\",\"feature\":\"${id_esc}\",\"name\":\"${plan_name_esc}\",\"date\":\"${plan_date_esc}\",\"tasks\":${tasks_json},\"results\":${results_arr_json}}"

    if [[ $first_plan -eq 0 ]]; then
      PLANS_JSON+=","
    fi
    PLANS_JSON+="$plan_obj"
    first_plan=0
  fi
done

# ─── Repo scanning helpers ────────────────────────────────────────────────────

# Read a key-value field from a section of project.md
# Usage: project_spec_field <file> <section_header> <key>
# Returns the field value, or empty string if not found
project_spec_field() {
  local file="$1"
  local section="$2"
  local key="$3"
  awk -v section="$section" -v key="$key" '
    $0 == section { in_section=1; next }
    in_section && /^## / { in_section=0; next }
    in_section && $0 ~ "^" key ": " {
      sub("^" key ": ", "")
      print
      exit
    }
  ' "$file"
}

# Check if a section exists in project.md
# Usage: project_spec_has_section <file> <section_header>
project_spec_has_section() {
  local file="$1"
  local section="$2"
  grep -qxF "$section" "$file" 2>/dev/null
}

# ─── Scan repos and build repo state map ─────────────────────────────────────
# Temp file: each line is tab-separated: alias<TAB>name<TAB>description<TAB>milestone<TAB>milestone_label<TAB>progress<TAB>next_feature<TAB>operational

REPO_SCAN_FILE="$COUNTER_DIR/repo_scan"
touch "$REPO_SCAN_FILE"

GIT_ROOT="${HOME}/git"

for repo_dir in "$GIT_ROOT"/*/; do
  [[ -d "$repo_dir" ]] || continue

  repo_name=$(basename "$repo_dir")

  # Skip launchpad (infrastructure, not a project)
  [[ "$repo_name" == "launchpad" ]] && continue

  project_md="$repo_dir/.claude/project.md"
  [[ -f "$project_md" ]] || continue

  # Read Identity fields
  r_name=$(project_spec_field "$project_md" "## Identity" "name")
  r_alias=$(project_spec_field "$project_md" "## Identity" "alias")
  r_desc=$(project_spec_field "$project_md" "## Identity" "description")

  # Use repo directory name as fallback
  [[ -z "$r_name" ]]  && r_name="$repo_name"
  [[ -z "$r_alias" ]] && r_alias="$repo_name"

  # Read State fields (or default to operational if section absent)
  if project_spec_has_section "$project_md" "## State"; then
    r_milestone=$(project_spec_field "$project_md" "## State" "milestone")
    r_milestone_label=$(project_spec_field "$project_md" "## State" "milestone-label")
    r_progress=$(project_spec_field "$project_md" "## State" "progress")
    r_next_feature=$(project_spec_field "$project_md" "## State" "next-feature")
    r_operational=$(project_spec_field "$project_md" "## State" "operational")
    [[ -z "$r_operational" ]] && r_operational="false"
  else
    r_milestone=""
    r_milestone_label=""
    r_progress=""
    r_next_feature=""
    r_operational="true"
  fi

  # Repos explicitly marked operational: clear milestone details
  if [[ "$r_operational" == "true" ]]; then
    r_milestone=""
    r_milestone_label=""
    r_progress=""
    r_next_feature=""
  fi

  # Use sentinel __E__ for empty fields so IFS tab-split preserves field positions
  [[ -z "$r_alias" ]]         && r_alias="__E__"
  [[ -z "$r_name" ]]          && r_name="__E__"
  [[ -z "$r_desc" ]]          && r_desc="__E__"
  [[ -z "$r_milestone" ]]     && r_milestone="__E__"
  [[ -z "$r_milestone_label" ]] && r_milestone_label="__E__"
  [[ -z "$r_progress" ]]      && r_progress="__E__"
  [[ -z "$r_next_feature" ]]  && r_next_feature="__E__"
  [[ -z "$r_operational" ]]   && r_operational="__E__"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$r_alias" "$r_name" "$r_desc" \
    "$r_milestone" "$r_milestone_label" "$r_progress" "$r_next_feature" \
    "$r_operational" >> "$REPO_SCAN_FILE"
done

# Helper: convert sentinel __E__ back to empty string
unsent() { local v="$1"; [[ "$v" == "__E__" ]] && echo "" || echo "$v"; }

# ─── Build projects aggregation ───────────────────────────────────────────────
# Merge discoveries (PROJECTS_LIST_FILE) with repo scan (REPO_SCAN_FILE).
# Match: discovery project id → repo alias (primary), then repo name.

# Collect all project ids seen via discoveries
ALL_PROJECTS_FILE="$COUNTER_DIR/all_projects"
cp "$PROJECTS_LIST_FILE" "$ALL_PROJECTS_FILE"

# Add repo aliases not yet registered via discoveries
while IFS=$'\t' read -r _ra _rn _rd _rm _rml _rp _rnf _rop; do
  ra=$(unsent "$_ra")
  [[ -z "$ra" ]] && continue
  if ! grep -qxF "$ra" "$ALL_PROJECTS_FILE" 2>/dev/null; then
    echo "$ra" >> "$ALL_PROJECTS_FILE"
  fi
done < "$REPO_SCAN_FILE"

MISSIONS_JSON=""
first_project=1

while IFS= read -r proj; do
    [[ -z "$proj" ]] && continue

    # Apply mission filter
    if [[ -n "$FILTER_MISSION" && "$proj" != "$FILTER_MISSION" ]]; then
      continue
    fi

    draft_c=$(proj_counter_get "$proj" "draft")  # proj here is the mission id from ALL_PROJECTS_FILE
    final_c=$(proj_counter_get "$proj" "final")
    archived_c=$(proj_counter_get "$proj" "archived")
    total_c=$(( draft_c + final_c + archived_c ))
    proj_esc=$(json_escape "$proj")

    # Look up repo state: match by alias first, then by name
    r_alias=""; r_name=""; r_desc=""; r_milestone=""; r_milestone_label=""
    r_progress=""; r_next_feature=""; r_operational="true"

    while IFS=$'\t' read -r _ra _rn _rd _rm _rml _rp _rnf _rop; do
      ra=$(unsent "$_ra"); rn=$(unsent "$_rn")
      if [[ "$ra" == "$proj" || "$rn" == "$proj" ]]; then
        r_alias="$ra"
        r_name="$rn"
        r_desc=$(unsent "$_rd")
        r_milestone=$(unsent "$_rm")
        r_milestone_label=$(unsent "$_rml")
        r_progress=$(unsent "$_rp")
        r_next_feature=$(unsent "$_rnf")
        r_operational=$(unsent "$_rop")
        break
      fi
    done < "$REPO_SCAN_FILE"

    # Build JSON null-safe values
    milestone_json=$(nullable_json "$r_milestone")
    milestone_label_json=$(nullable_json "$r_milestone_label")
    progress_json=$(nullable_json "$r_progress")
    next_feature_json=$(nullable_json "$r_next_feature")
    alias_json=$(nullable_json "$r_alias")
    desc_json=$(nullable_json "$r_desc")
    [[ "$r_operational" == "true" ]] && operational_json="true" || operational_json="false"

    project_obj="{\"id\":\"${proj_esc}\",\"alias\":${alias_json},\"description\":${desc_json},\"stage\":${milestone_json},\"stage_label\":${milestone_label_json},\"progress\":${progress_json},\"next_feature\":${next_feature_json},\"operational\":${operational_json},\"module_counts\":{\"draft\":${draft_c},\"final\":${final_c},\"archived\":${archived_c}},\"total\":${total_c}}"

    if [[ $first_project -eq 0 ]]; then
      MISSIONS_JSON+=","
    fi
    MISSIONS_JSON+="$project_obj"
    first_project=0
done < "$ALL_PROJECTS_FILE"

# ─── Parse cockpit-manual.yaml ────────────────────────────────────────────────

MANUAL_YAML="${HOME}/.claude/cockpit-manual.yaml"
NEEDS_ATTENTION_JSON="[]"
LIMBO_JSON="[]"

if [[ -f "$MANUAL_YAML" ]]; then
  # Try python3 yaml first, fall back to awk parser
  MANUAL_PARSED=$(python3 - "$MANUAL_YAML" <<'PYEOF' 2>/dev/null || true
import sys, json

yaml_path = sys.argv[1]

try:
    import yaml
    with open(yaml_path, 'r') as f:
        data = yaml.safe_load(f) or {}
    needs_attention = data.get('needs-attention') or []
    limbo = data.get('limbo') or []
    print(json.dumps({"needs_attention": needs_attention, "limbo": limbo}))
except ImportError:
    # yaml not available — signal fallback
    print("FALLBACK")
PYEOF
)

  if [[ "$MANUAL_PARSED" == "FALLBACK" || -z "$MANUAL_PARSED" ]]; then
    # Awk fallback: parse flat YAML structure
    MANUAL_PARSED=$(awk '
      BEGIN { section=""; in_needs=0; in_limbo=0; needs_arr=""; limbo_arr="" }
      /^needs-attention:/ { section="needs"; in_needs=1; in_limbo=0; next }
      /^limbo:/ { section="limbo"; in_limbo=1; in_needs=0; next }
      /^[a-z]/ { section=""; in_needs=0; in_limbo=0 }
      in_needs && /^[[:space:]]*-[[:space:]]/ {
        val=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",val)
        # skip comment lines
        if (val ~ /^#/) next
        if (needs_arr != "") needs_arr = needs_arr ","
        gsub(/"/, "\\\"", val)
        needs_arr = needs_arr "\"" val "\""
      }
      in_limbo && /^[[:space:]]*-[[:space:]]/ {
        val=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",val)
        if (val ~ /^#/) next
        if (limbo_arr != "") limbo_arr = limbo_arr ","
        gsub(/"/, "\\\"", val)
        limbo_arr = limbo_arr "\"" val "\""
      }
      END {
        print "{\"needs_attention\":[" needs_arr "],\"limbo\":[" limbo_arr "]}"
      }
    ' "$MANUAL_YAML")
  fi

  if [[ -n "$MANUAL_PARSED" && "$MANUAL_PARSED" != "FALLBACK" ]]; then
    NEEDS_ATTENTION_JSON=$(python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(json.dumps(d.get('needs_attention',[])))" <<< "$MANUAL_PARSED" 2>/dev/null || echo "[]")
    LIMBO_JSON=$(python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(json.dumps(d.get('limbo',[])))" <<< "$MANUAL_PARSED" 2>/dev/null || echo "[]")
  fi
fi

# ─── Assemble final JSON ──────────────────────────────────────────────────────

GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S")

if [[ -n "$FILTER_MISSION" ]]; then
  FILTER_VAL="\"$(json_escape "$FILTER_MISSION")\""
else
  FILTER_VAL="null"
fi

FINAL_JSON="{\"generated_at\":\"${GENERATED_AT}\",\"filter_mission\":${FILTER_VAL},\"missions\":[${MISSIONS_JSON}],\"modules\":[${MODULES_JSON}],\"plans\":[${PLANS_JSON}],\"needs_attention\":${NEEDS_ATTENTION_JSON},\"limbo\":${LIMBO_JSON}}"

# ─── generate_cockpit_md() ─────────────────────────────────────────────────────

generate_cockpit_md() {
  local json_file="$1"
  local output="${HOME}/git/cockpit.md"
  python3 - "$json_file" "$output" <<'PYEOF'
import sys, json, re

json_path   = sys.argv[1]
output_path = sys.argv[2]

with open(json_path, 'r') as f:
    data = json.load(f)

generated_at = data.get('generated_at', '')
missions = data.get('missions', [])
modules = data.get('modules', [])
needs_attention = data.get('needs_attention', [])
limbo = data.get('limbo', [])

# Build modules index by mission
modules_by_mission = {}
for mod in modules:
    proj = mod.get('mission', '')
    if proj not in modules_by_mission:
        modules_by_mission[proj] = []
    modules_by_mission[proj].append(mod)

# Separate stage vs operational missions
stage_missions = []
operational_missions = []

for p in missions:
    proj_id = p.get('id', '')
    # Skip limbo projects from main listing
    if proj_id in limbo:
        continue
    if p.get('stage') and not p.get('operational', False):
        stage_missions.append(p)
    else:
        operational_missions.append(p)

# Sort stage missions by progress (least progress first — more work to do)
def parse_progress(p):
    prog = p.get('progress') or ''
    m = re.match(r'(\d+)/(\d+)', str(prog))
    if m:
        done, total = int(m.group(1)), int(m.group(2))
        return done / total if total > 0 else 0.0
    return 0.0

stage_missions.sort(key=parse_progress)

# Sort operational alphabetically
operational_missions.sort(key=lambda p: (p.get('id') or '').lower())

lines = []
lines.append('# Mission Control')
lines.append(f'_Auto-generated: {generated_at}. Run \`cockpit.sh --refresh\` to update._')
lines.append('')
lines.append('## Missions')
lines.append('')

# Stage missions
for p in stage_missions:
    proj_id = p.get('id', '')
    alias = p.get('alias') or proj_id
    stage = p.get('stage') or ''
    stage_label = p.get('stage_label') or ''
    progress = p.get('progress') or ''
    next_feature = p.get('next_feature') or ''
    desc = p.get('description') or ''

    header = f"### {proj_id} ({alias})"
    if stage:
        s_str = f"S{stage}" if not str(stage).startswith('S') else str(stage)
        if stage_label:
            header += f" — {s_str}: {stage_label}"
        else:
            header += f" — {s_str}"
    lines.append(header)

    meta_parts = []
    if progress:
        meta_parts.append(f"Progress: {progress}")
    if next_feature:
        meta_parts.append(f"Next: {next_feature}")
    if meta_parts:
        lines.append(' | '.join(meta_parts))
    elif desc:
        lines.append(desc)

    # Modules for this mission
    proj_modules = modules_by_mission.get(proj_id, [])
    if proj_modules:
        mod_parts = []
        for mod in proj_modules:
            mod_id = mod.get('id', '')
            phase = mod.get('phase', '')
            if phase:
                mod_parts.append(f"{mod_id} ({phase})")
            else:
                mod_parts.append(mod_id)
        lines.append('')
        lines.append(f"**Modules:** {', '.join(mod_parts)}")

    lines.append('')

# Operational missions
for p in operational_missions:
    proj_id = p.get('id', '')
    alias = p.get('alias') or proj_id
    desc = p.get('description') or ''

    lines.append(f"### {proj_id} ({alias}) — Operational")
    if desc:
        lines.append(desc)

    # Modules for this mission
    proj_modules = modules_by_mission.get(proj_id, [])
    if proj_modules:
        mod_parts = []
        for mod in proj_modules:
            mod_id = mod.get('id', '')
            phase = mod.get('phase', '')
            if phase:
                mod_parts.append(f"{mod_id} ({phase})")
            else:
                mod_parts.append(mod_id)
        lines.append('')
        lines.append(f"**Modules:** {', '.join(mod_parts)}")

    lines.append('')

# Needs Attention
if needs_attention:
    lines.append('## Needs Attention')
    lines.append('| Mission | Action | Type | Context |')
    lines.append('|---|---|---|---|')
    for item in needs_attention:
        if isinstance(item, dict):
            proj = item.get('mission', item.get('project', ''))
            action = item.get('action', '')
            itype = item.get('type', '')
            context = item.get('context', '')
            lines.append(f"| {proj} | {action} | {itype} | {context} |")
    lines.append('')

# Limbo
if limbo:
    lines.append('## Limbo')
    lines.append(', '.join(limbo))
    lines.append('')

with open(output_path, 'w') as f:
    f.write('\n'.join(lines))

print(f"cockpit.md written to {output_path}")
PYEOF
}

# ─── Output ───────────────────────────────────────────────────────────────────

if [[ $JSON_ONLY -eq 1 ]]; then
  printf '%s\n' "$FINAL_JSON"
  exit 0
fi

# --refresh: save JSON, generate cockpit.md, then open HTML
if [[ $REFRESH -eq 1 ]]; then
  COCKPIT_JSON_PATH="${HOME}/.claude/cockpit.json"
  printf '%s\n' "$FINAL_JSON" > "$COCKPIT_JSON_PATH"

  generate_cockpit_md "$COCKPIT_JSON_PATH"

  # Fall through to HTML generation
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

if [[ $REFRESH -eq 1 ]]; then
  echo "cockpit.json + cockpit.md + HTML generated"
fi

open "$OUTPUT"
echo "$OUTPUT"
