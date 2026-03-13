## workspace-search

- QMD's CLI query expansion (`qmd query "..."`) generates nonsensical expansions for Portuguese terms (e.g., "separada" → "separada 5 injuries"). This breaks single-string CLI queries for PT-BR content. Workaround: use MCP sub-queries with explicit `lex` + `vec` types instead of relying on the CLI's built-in expansion. The MCP path is the intended consumer anyway, but this is a trap for manual CLI debugging.
- `claude mcp add --scope user` writes MCP server config to `~/.claude.json`, not `~/.claude/settings.json`. PRDs referencing "settings.json" for MCP config are technically wrong — the actual file is `~/.claude.json`. Both files exist but serve different purposes.

## domain-map

- Bash-to-JS data contract (list vs. dict) is not caught by render tests. `domain-map.sh` emitted artifacts as a Python list; the JS template consumed it as a keyed object. The HTML rendered correctly (pipeline, phases, cards), so 7/8 success criteria passed. Only the criterion that accessed a specific key (`artifact["draft"]`) failed. Lesson: when a shell script produces JSON consumed by JS, add an explicit success criterion that reads a key from the emitted object — don't rely on visual render alone to validate data shape.

## plan-ux

- `awk -v` strips backslashes from variable values, making it unreliable for injecting JSON into HTML templates. The DAG parsing stays in awk, but template injection must use Python (or `sed` reading from a temp file). Document this constraint whenever a script needs to pass arbitrary user content into awk variables.
- The awk DAG/results parser only handles single-line field values. Multi-line values (e.g., a summary spanning two lines) will be silently truncated to the first line. This is a known limitation that future parsers should either document explicitly or replace with a Python/jq-based parser.
- YAML frontmatter standardization (`discovery.md`, `ship.md`, `prd-template.md`) was delivered in the same commit as plan-ux but was not in the original PRD scope. It was a necessary dependency — ship.md's archive logic and discovery.md's status reads needed a consistent frontmatter contract to support future tooling. When a feature depends on a schema that isn't yet standardized, standardizing it in the same PR is lower risk than treating it as a separate ticket.

## domain-model-v2

- Dead variable assignments in Bash are silent. `derive_status.sh` had a duplicate assignment (`local decision=$(...)` followed immediately by another assignment to the same variable) that was caught only during a simplification pass. Bash doesn't warn on reassignment — the variable just silently takes the second value, masking the dead first assignment. Pattern: when a variable is assigned and immediately reassigned before any use, the first assignment is unreachable. Review scripts for this during code review, not just during testing.
- Files created inside a worktree are not visible in `git diff` until explicitly staged. During evaluation, `draft.md` was created in a worktree but not staged, so it didn't appear in `git diff --name-only`, causing the evaluator to flag a false positive (thinking the file wasn't created). When verifying worktree deliverables, `git status` (which shows untracked files) is the correct check — not `git diff`, which only shows staged/modified tracked files.

## cockpit

- macOS ships Bash 3.2, which has no associative arrays. When a script needs per-key counters that accumulate across a loop (e.g., bet counts per project), use a temp directory with one file per key: `echo $(( cur + 1 )) > "$COUNTER_DIR/${key}_${kind}"`. Read with `cat`, initialize with `touch`. Clean up via `trap 'rm -rf "$COUNTER_DIR"' EXIT`. This pattern is fully portable to Bash 3.2 and avoids `declare -A` or external tools like `jq` for what is essentially a hash map write path.
