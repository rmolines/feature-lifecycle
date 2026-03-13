#!/usr/bin/env bash
# Migration: ~/.claude/discoveries/ → ~/.claude/initiatives/
set -euo pipefail

OLD="$HOME/.claude/discoveries"
NEW="$HOME/.claude/initiatives"

if [ ! -d "$OLD" ]; then
  echo "Nothing to migrate: $OLD does not exist"
  exit 0
fi

if [ -d "$NEW" ]; then
  echo "ERROR: $NEW already exists. Aborting."
  exit 1
fi

echo "Migrating $OLD → $NEW"
mv "$OLD" "$NEW"

# Create symlink for backwards compat during transition
ln -s "$NEW" "$OLD"
echo "Created symlink $OLD → $NEW"

echo "Migration complete. $(find "$NEW" -name "*.md" | wc -l | tr -d ' ') markdown files."

# Validate frontmatter of all existing documents
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "Validating frontmatter against Zod schemas..."
cd "$SCRIPT_DIR/.." && bun scripts/validate-frontmatter.ts
VALIDATE_EXIT=$?
if [ $VALIDATE_EXIT -ne 0 ]; then
  echo "WARNING: Some documents have invalid frontmatter. Review errors above."
else
  echo "All documents passed frontmatter validation."
fi
