#!/usr/bin/env bash
# Guard: block direct Read/Write/Edit to ~/.claude/initiatives/ and ~/.claude/discoveries/
# Instructs users to use MCP tools instead.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

# Only check Read, Write and Edit tools
if [ "$TOOL" != "Read" ] && [ "$TOOL" != "Write" ] && [ "$TOOL" != "Edit" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Expand ~ if present
FILE_PATH="${FILE_PATH/#\~/$HOME}"

INITIATIVES_DIR="$HOME/.claude/initiatives"
DISCOVERIES_DIR="$HOME/.claude/discoveries"

# Check if the file path is under initiatives or discoveries
if [[ "$FILE_PATH" == "$INITIATIVES_DIR"/* ]] || [[ "$FILE_PATH" == "$DISCOVERIES_DIR"/* ]]; then
  if [ "$TOOL" = "Read" ]; then
    echo "{\"decision\":\"block\",\"reason\":\"Direct reads from initiatives/ are blocked. Use QMD tools instead: qmd.get, qmd.multi_get, qmd.query.\"}"
  else
    echo "{\"decision\":\"block\",\"reason\":\"Direct writes to initiatives/ are blocked. Use the Initiatives MCP tools instead: init_create, init_update_fields, init_update_section.\"}"
  fi
else
  echo '{"decision":"allow"}'
fi
