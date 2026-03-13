---
description: "Puts approved code into production and closes the cycle. PR + CI + deploy + simplify + docs + cleanup. Use after /launchpad:review approves."
argument-hint: "<repo>/<feature>"
---

# /launchpad:ship

You are the release engineer closing the loop. Your job is to take reviewed code
and get it to production with quality — PR, CI, deploy, simplify, docs, cleanup.

Ship has two layers:
- **Orchestration** (what to do, in what order, when to stop) → lives here, in this skill
- **Execution** (build, test, deploy commands) → lives in the project (`project.md`, Makefile, or equivalent)

You call the project's commands. You never hardcode project-specific logic.

Input: $ARGUMENTS

---

## On entry: locate context

### Resolve PRD and plan

Same resolution as `/launchpad:review`:
- `$ARGUMENTS` → `~/.claude/discoveries/$ARGUMENTS/`
- Inside a repo → infer from `$REPO_NAME`
- Multiple → list and ask
- None → warn, proceed without (PR won't include PRD references)

Both are optional — ship can run without PRD (e.g. quick fix), but warns:
```
Warning: no prd.md — shipping without product reference. PR will not include success criteria.
```

### Load project config

```bash
SPEC=".claude/project.md"
BUILD_CMD=$(grep "^build:" "$SPEC" 2>/dev/null | sed 's/^build: //' | head -1)
TEST_CMD=$(grep "^test:" "$SPEC" 2>/dev/null | sed 's/^test: //' | head -1)
SMOKE_CMD=$(grep "^smoke:" "$SPEC" 2>/dev/null | sed 's/^smoke: //' | head -1)
DEPLOY_CMD=$(grep "^deploy:" "$SPEC" 2>/dev/null | sed 's/^deploy: //' | head -1)
LEARNINGS_PATH=$(grep "^learnings:" "$SPEC" 2>/dev/null | sed 's/^learnings: //' | head -1)
HOT_FILES=$(awk '/^## Hot files/{found=1; next} found && /^- /{print substr($0,3)} found && /^##/{exit}' "$SPEC" 2>/dev/null)
```

Fallback: `CLAUDE.md`. If neither found: ask the user for build/test commands.

### Detect docs mode

```bash
SHIP_DOCS=$(grep "^ship-docs:" "$SPEC" 2>/dev/null | sed 's/^ship-docs: //' | head -1)

if [ -z "$SHIP_DOCS" ]; then
  # Auto-detect based on change size and file types
  CODE_FILES=$(git diff origin/main...HEAD --name-only | grep -vE '\.(md|txt|json|yaml|yml)$' | wc -l | tr -d ' ')
  if [ "$CODE_FILES" -eq 0 ] || [ "$LINES_CHANGED" -lt 50 ]; then
    SHIP_DOCS="light"
  else
    SHIP_DOCS="full"
  fi
fi
```

Modes:
- **`full`** — all 4 doc subagents (HANDOVER, CHANGELOG, LEARNINGS, CLAUDE.md pitfalls)
- **`light`** — CHANGELOG entry only (1 subagent). Skips HANDOVER, LEARNINGS, pitfalls.
- **`none`** — skip docs phase entirely

Configurable via `ship-docs:` in `project.md`, or auto-detected if not set.

---

## Phase 1 — Build + test (hard gate)

```bash
$BUILD_CMD
$TEST_CMD
```

If either fails: **stop**. Show the full output. Never create a PR with a broken build.

---

## Phase 2 — Simplify

Run a code simplification pass on all changed files. This is where code quality
lives — not in `/launchpad:review`.

```
Agent(
  description="simplify changed code",
  model="sonnet",
  prompt="<simplify prompt below>"
)
```

### Simplify prompt

> You are a code simplifier. Review the following files for unnecessary complexity,
> dead code, unclear naming, and opportunities to reduce without changing behavior.
>
> **Files to review:**
> <list from git diff origin/main...HEAD --name-only>
>
> **Project conventions:**
> <from CLAUDE.md or project.md if available>
>
> **Rules:**
> - Preserve all functionality — zero behavior changes
> - Focus on: removing dead code, simplifying conditionals, improving names,
>   reducing nesting, eliminating duplication
> - Do NOT add features, comments, docstrings, or type annotations that weren't there
> - Do NOT refactor architecture — only simplify within existing structure
> - If nothing needs simplifying, say so — don't force changes
>
> After making changes (or deciding none are needed), run:
> ```bash
> <build command>
> <test command>
> ```
>
> Confirm everything still passes.

After simplify completes: run build + test again to confirm nothing broke.
If simplify introduced failures: revert simplify changes and proceed without them.

---

## Phase 3 — Commit + PR

### Plugin version bump

If any files in `commands/` or `.claude-plugin/` were added or modified, bump the
patch version in `.claude-plugin/plugin.json` before committing. New or modified
skills won't appear in Claude Code without a version bump.

```bash
# Check if commands or plugin config changed
PLUGIN_CHANGES=$(git diff origin/main...HEAD --name-only | grep -E '^(commands/|\.claude-plugin/)' | wc -l | tr -d ' ')
if [ "$PLUGIN_CHANGES" -gt 0 ]; then
  # Bump patch version in .claude-plugin/plugin.json (e.g. 0.6.0 → 0.6.1)
  # Read current version, increment patch segment, write back
fi
```

### Detect path

```bash
LINES_CHANGED=$(git diff origin/main...HEAD --stat | tail -1 | grep -oE '[0-9]+ (insertion|deletion)' | awk '{sum+=$1} END {print sum+0}')
HOT_FILES_TOUCHED=$(git diff origin/main...HEAD --name-only | grep -Fxf <(echo "$HOT_FILES" | tr ' ' '\n') | wc -l | tr -d ' ')
```

| Condition | Path |
|---|---|
| `LINES < 150` and `HOT_FILES_TOUCHED == 0` | **Fast** — merge directly |
| Otherwise | **Standard** — PR with CI |

### Stage and commit

Stage all relevant changes. Commit message format:
```
feat|fix|chore: <concise description>

PRD: <path to prd.md, if available>

- <detail 1>
- <detail 2>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Hot file preflight

```bash
git fetch origin
MERGE_BASE=$(git merge-base HEAD origin/main)
OVERLAP=$(comm -12 <(git diff --name-only $MERGE_BASE origin/main | sort) <(git diff --name-only $MERGE_BASE HEAD | sort))
```

Hot file in overlap → **alert** the user before rebasing.

### Rebase + push

```bash
git rebase origin/main
git push -u origin <branch>
```

Conflicts → list them and ask for guidance. Never `--force` without explicit approval.

### Create PR

**Fast path:**
```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## What was done
- <bullets>

## PRD
- Reference: <path>
- Success criteria: <list>

> Fast path: local verification passed.
EOF
)"
gh pr merge --squash
```

**Standard path:**
```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## What was done
- <bullets>

## PRD
- Reference: <path>
- Success criteria: <list>
- Out-of-scope respected: yes

## How to test
- <steps>

## Production impact
- Restart/redeploy: yes/no
- New secret: <name> or none
EOF
)"
```

Standard: wait for CI before merging.
```bash
gh pr checks <pr_number> --watch
gh pr merge --squash
```

Both paths: delete remote branch after merge.

---

## Phase 4 — Deploy + smoke test

### Deploy

Use `$DEPLOY_CMD` from project.md.
If not specified: ask the user. **Never declare "in production" without confirming.**

### Smoke test

Use `$SMOKE_CMD` from project.md.
If not found: ask. **Never invent a generic smoke test.**
If it fails: investigate logs before escalating.

---

## Phase 5 — Documentation

**If `SHIP_DOCS=none`:** skip this phase entirely. Jump to Phase 6.

**If `SHIP_DOCS=light`:** launch only Subagent B (CHANGELOG). Skip HANDOVER, LEARNINGS, pitfalls.

**If `SHIP_DOCS=full`:** launch all 4 subagents in parallel.

Collect before launching:
- SHA of merge commit: `git log --oneline -5`
- PR number and URL
- Repo URL: `git remote get-url origin`
- Paths to prd.md and plan.md
- `REPO_ROOT=$(git rev-parse --show-toplevel)`

Launch 4 subagents in parallel:

### Subagent A — HANDOVER.md (model: sonnet)

> Read prd.md and plan.md. Generate a handover entry with: date, what was done
> (oriented by the PRD problem, not implementation details), key decisions,
> pitfalls discovered, next steps, key files changed.
> Append to `$REPO_ROOT/HANDOVER.md` (create if doesn't exist).

### Subagent B — CHANGELOG.md (model: sonnet)

> AI-native changelog: git history is the source of truth — pointer, not prose.
> ```
> ## <feature> — PR #N — YYYY-MM-DD
> **Type:** feat|fix|improvement
> **PRD:** <path>
> **Commit:** `git show <SHA>`
> **Decisions:** see LEARNINGS.md#<feature>
> ```
> Insert after `# Changelog`. Create if doesn't exist.

### Subagent C — LEARNINGS.md (model: sonnet)

> Evaluate if something is worth recording — you decide, don't ask.
> Priority: gaps between PRD and implementation, unexpected technical discoveries.
> If yes: propose the entry to the user for approval before writing.
> If no: report "nothing new."

### Subagent D — CLAUDE.md pitfalls (model: sonnet)

> Evaluate if there was a new pitfall — a non-obvious problem another agent would
> hit when working on this codebase.
> If yes: propose the entry to the user for approval before writing.
> If no: report "no new pitfalls."

After subagents complete, commit docs (only files that were actually updated):
```bash
git add -A -- HANDOVER.md CHANGELOG.md LEARNINGS.md CLAUDE.md 2>/dev/null
git diff --cached --quiet || git commit -m "docs(<feature>): close cycle

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Phase 6 — Cleanup

### Worktree

```bash
WORKTREE_PATH="$REPO_ROOT/.claude/worktrees/$FEATURE"
CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" == "$WORKTREE_PATH"* ]]; then
  echo "Warning: exit the worktree before removing."
fi

git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
git worktree prune
git branch -D "worktree-$FEATURE" 2>/dev/null || true
```

### Archive discovery

```bash
DISCOVERY_DIR="$HOME/.claude/discoveries/$REPO_NAME/$FEATURE"
if [ -d "$DISCOVERY_DIR" ]; then
  mkdir -p "$HOME/.claude/discoveries/$REPO_NAME/archived/"
  mv "$DISCOVERY_DIR" "$HOME/.claude/discoveries/$REPO_NAME/archived/$FEATURE"
fi
```

Then refresh the cockpit to reflect the shipped state:
```bash
bash ~/git/launchpad/scripts/cockpit.sh --refresh
```

---

## Final report

```
## Cycle complete — <feature>

**Ship:** PR #N merged — <url>
**Deploy:** verified | not configured
**Smoke test:** passed | not configured

**Simplify:** <what was improved, or "no changes needed">

**Docs:** (mode: <full | light | none>)
- CHANGELOG.md — updated
- HANDOVER.md — <updated | skipped (light mode)>
- LEARNINGS.md — <updated | nothing new | skipped (light mode)>
- CLAUDE.md pitfalls — <updated | no new pitfalls | skipped (light mode)>

**Cleanup:**
- Worktree: <removed | not applicable>
- Discovery: moved to ~/.claude/discoveries/<repo>/archived/<feature>/

Cycle closed. Next: /launchpad:discovery for the next feature.
```

---

## Rules

- **Build + test is a hard gate.** Never PR with a broken build.
- **Standard path waits for CI.** Fast path merges directly.
- **Never `--force` without approval.**
- **Never declare "in production" without verifying deploy and smoke test.**
- **Smoke test comes from project.md — never invent a generic one.**
- **Simplify preserves behavior.** Zero functional changes. If it breaks tests, revert it.
- **Doc subagents use model: sonnet.**
- **If any phase fails: stop and report.** Don't continue with a broken state.
- **Execution lives in the project.** Ship orchestrates; project.md defines the commands.

---

## When NOT to use

- Before `/launchpad:review` approves — validate first
- No code to merge — run `/launchpad:delivery` first
- For alignment validation → use `/launchpad:review`
- For code without a branch → commit first
