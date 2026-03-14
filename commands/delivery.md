---
description: "Executes an approved plan by orchestrating subagents in parallel batches. Use after /launchpad:planning produces an approved plan.md."
argument-hint: "<repo>/<feature> or path to plan.md"
---

# /launchpad:delivery

You are the orchestrator (Opus thread) executing an approved plan.
Subagents do the implementation. You coordinate, validate, and unblock.

Input: $ARGUMENTS

---

## Core principle

The plan is the contract — execute it faithfully.

Don't improvise deliverables not in the plan. Don't skip validations. Don't re-derive
the execution order — read it from the Execution DAG. Subagents never spawn other
subagents. All orchestration flows from this thread.

---

## On entry: locate and validate the plan

### Resolve path

**If `$ARGUMENTS` provided:**
Try in order:
1. `$ARGUMENTS/plan.md` as literal path
2. `~/.claude/missions/$ARGUMENTS/plan.md`
3. `~/.claude/missions/$ARGUMENTS/*/plan.md` (one level deep — mission/stage/module)
4. `~/.claude/missions/$ARGUMENTS/*/*/plan.md` (two levels deep)

**If inside a repo (has `.git`):**
```bash
MISSION_NAME=$(basename $(git rev-parse --show-toplevel))
ls ~/.claude/missions/$MISSION_NAME/*/plan.md 2>/dev/null || \
ls ~/.claude/missions/$MISSION_NAME/*/*/plan.md 2>/dev/null
```

**If nothing found:**
```
No plan.md found.
Run /launchpad:planning to generate a plan before /launchpad:delivery.
```

If multiple found: list and ask the user to choose.

### Read context

Read these **in parallel** (3 simultaneous reads):

1. `plan.md` in full — especially the `## Execution DAG` section
2. `module.md` first, fallback `prd.md`, if it exists (product reference)
3. `stage.md` from the parent stage directory if it exists (for stage context)
4. `.claude/project.md` from the target repo — build/test commands, hot files
   - If no project config: `Warning: no project.md — using CLAUDE.md`

> **Reading missions files:** see CLAUDE.md pitfall "Reading initiatives files".
> TL;DR: try `qmd.get` with exact path → if not found → `Bash(cat <full-path>)`.

**Critical:** Read project.md in the same parallel batch as plan.md/prd.md.
The build/test commands come from project.md — without it, baseline check will fail
with wrong commands.

### Parse the Execution DAG

Read the `## Execution DAG` section from plan.md and extract:
- Task IDs, dependencies, executor model, isolation mode, max retries, acceptance criteria

```bash
# Extract all task IDs and their dependencies
awk '/^## Execution DAG/{found=1} found && /^task:/{id=$2} found && /^depends_on:/{print id, $0}' plan.md
```

Build the execution graph: which tasks have no dependencies (first batch), which
depend on what (subsequent batches), where gates are defined.

If the plan lacks an Execution DAG section:
`Warning: plan has no Execution DAG — deriving execution order from deliverable descriptions`

### Check for review.md (amendment mode)

```bash
ls ~/.claude/missions/$FEATURE_PATH/review.md 2>/dev/null
```

If `review.md` exists AND `decision: back-to-delivery`:

**Amendment mode activated.** Read the review findings and adapt execution:

1. Read the Action Items from review.md — these define what needs to be re-done
2. Read the Success Criteria Status — identify which criteria are FAIL or PARTIAL
3. Map action items back to deliverables in plan.md
4. Build a **reduced DAG** containing only:
   - Deliverables that map to failed action items
   - Deliverables that depend on those (transitively)
5. Skip all deliverables already marked as passing

Report to the user:
```
Amendment mode — review.md found (back-to-delivery)

Action items from review:
- <item 1>
- <item 2>

Deliverables to re-execute: D2, D4
Skipping (already passing): D1, D3

Proceed?
```

Wait for confirmation before executing.

If `review.md` exists but `decision` is NOT `back-to-delivery`: ignore it — wrong routing.
If no `review.md`: proceed normally (existing behavior, no changes).

### Validate before starting

Check for:
- Deliverables with self-contained prompts (if missing: `Warning: plan without subagent prompts — adapting`)
- Circular dependencies (stop and report)
- Deliverables without acceptance criteria (warn)
- Gate points in DAG (note: gates are opt-in — only pause where the plan explicitly sets gate: true)

If critical inconsistencies found: report to the user before starting.

---

## Baseline check (hard gate)

Before launching any subagent:

```bash
# Build
<build command from project.md>

# Tests
<test command from project.md>
```

If build or tests fail: **stop**. Report the failure. Do not start delivery on a
broken codebase unless the plan explicitly addresses it.

---

## Execution

### Launch by batch

> **Amendment mode:** if active, only launch deliverables in the reduced DAG.
> The enriched prompt for each re-executed deliverable must include the review's action items
> relevant to that deliverable in the `[EXECUTION CONTEXT]` block:
> ```
> [REVIEW FINDINGS — amendment mode]
> This deliverable is being re-executed because the previous attempt had issues.
> Action items from review:
> - <relevant action items for this deliverable>
> Previous issues:
> - <relevant criteria that were FAIL/PARTIAL>
> ```

For each batch of parallel deliverables:

1. **Identify the batch** — all tasks in the DAG whose dependencies are satisfied
2. **Enrich each prompt** with runtime context (see below)
3. **Launch all in a single message** — multiple Agent tool calls simultaneously
4. **Wait for all to complete** before processing results

```
Agent(description="D1 — <title>", model="sonnet", prompt="<enriched prompt>")
Agent(description="D2 — <title>", model="haiku", prompt="<enriched prompt>")
```

Use `isolation: "worktree"` in the Agent call for any deliverable marked
`isolation: worktree` in the DAG.

### Enrich prompts

Before sending the plan's prompt to a subagent, prepend runtime context:

```
[EXECUTION CONTEXT — do not modify this section]
Repo: <name>
Current branch: <branch>
Worktree path: <path, if applicable>
Build command: <from project.md>
Test command: <from project.md>
Hot files (read before editing): <list from project.md>

[DELIVERABLE PROMPT]
<original prompt from the plan>
```

If previous batches produced results relevant to this deliverable, append:
```
[RESULTS FROM PREVIOUS BATCHES]
D1: status: success — <summary>
D2: status: success — <summary>
```

The subagent receives no session context. Everything it needs is in the prompt.

### Process results

When a subagent returns, parse its structured result:

```
task_id: D<N>
status: success | partial | failed
summary: <what was done>
errors: <list or empty>
validation_result: <output of validation command>
files_changed: <list of paths>
```

Track each deliverable's result in memory as it completes. You will need all results to write results.md after the final batch.

**If `status: success`** — mark as complete, proceed.

**If `status: partial`** — check if retry would help. If `retries < max_retries`,
retry with the error context appended. Otherwise, proceed with a warning.

**If `status: failed`** — retry up to `max_retries` with error context:
```
[PREVIOUS ATTEMPT FAILED]
Error: <error from previous attempt>
Validation output: <what failed>

Please fix the issue and try again. The original prompt follows.

[DELIVERABLE PROMPT]
<original prompt>
```

After `max_retries` exhausted: **stop and report** to the user with full diagnosis.
Do not attempt to fix it yourself. Do not continue to the next batch.

**If the subagent returns narrative instead of structured result:** extract what you
can (status, files changed) and proceed, but note the deviation.

### Resolve stage for path construction

When constructing paths (e.g. for results.md), derive the stage from the plan.md path:
```bash
# plan.md is at ~/.claude/missions/<mission>/<stage>/<module>/plan.md
# Extract stage as the second path segment after missions/<mission>/
STAGE=$(dirname "$PLAN_PATH" | xargs dirname | xargs basename)
MODULE=$(dirname "$PLAN_PATH" | xargs basename)
```

### Human gates (opt-in)

Gates only trigger at points where the Execution DAG explicitly sets `gate: true`.
No implicit gates — not even after Batch 1. If the plan didn't flag a gate, delivery
continues autonomously.

When a gate triggers:

```
## Gate — Batch 1 complete

Progress:
- D1 — <title>: success — <one-line summary>
- D2 — <title>: success — <one-line summary>

Next batch: D3, D4 (parallel)

Confirm to proceed, or adjust the plan.
```

Wait for explicit approval before continuing. If the user requests changes, adapt
the remaining plan accordingly.

---

## Integration

### Build and test

After all deliverables complete:

```bash
<build command>
<test command>
<smoke test, if defined in project.md>
```

Report: X/Y tests passing, any remaining failures.

### Worktree merge (if applicable)

If deliverables ran in worktree isolation:

1. Check for merge conflicts with the base branch
2. If no conflicts: merge cleanly
3. If conflicts exist: report the conflicting files and the deliverables that touched
   them. Attempt resolution preserving each deliverable's intent. Run build + tests
   after resolution.
4. If resolution is ambiguous: ask the user before proceeding

### Integration commit

After each deliverable is integrated (worktree merge complete) and build + tests pass,
commit the changes immediately:

1. **Stage only the files listed in `files_changed`** from the subagent's structured result.
   Never use `git add -A` or `git add .` — stage file by file:
   ```bash
   git add <file1> <file2> ...   # files from files_changed only
   ```

2. **Commit with the canonical message format:**
   ```
   feat(<module>): D<N> — <title>

   Co-Authored-By: <executor model> <noreply@anthropic.com>
   ```
   Where `<module>` is the feature slug, `<N>` is the deliverable number, and `<title>`
   is the deliverable title from the plan. Use the executor model declared in the DAG
   (e.g. `claude-sonnet-4-5`, `claude-haiku-4-5`).

3. **If the commit fails due to a pre-commit hook:** fix the reported issue, re-stage
   the same files, and retry the commit. Do not skip hooks (`--no-verify`).

4. **In amendment mode:** follow the same pattern — one commit per re-executed
   deliverable, using the same message format.

Do not push. Push is handled by `/launchpad:ship`.

### Manual test checklist

Generate a list of what needs human validation:
- What was tested automatically (with evidence)
- What requires human interaction (UI, end-to-end flows, edge cases not covered)

---

### Persist results

After all batches complete and before generating the final report, write `results.md` to the module's directory:

```bash
~/.claude/missions/<mission>/<stage>/<module>/results.md
```

Use Schema 5 format (see `templates/schemas.md`). For each deliverable, write one block with the fields: `task`, `status`, `summary`, `files_changed`, `errors`, `validation_result`. Blocks are separated by blank lines.

Include ALL deliverables — even skipped ones in amendment mode. For deliverables that were skipped, write:

```
task: D<N>
status: skipped
summary: Previously passing
files_changed:
errors:
validation_result:
```

After writing results.md, open the visual results view in the browser:

```bash
bash ~/git/launchpad/scripts/ensure-server.sh && open http://localhost:3333/plan-view?m=<mission>&mod=<module>
```
Where `<mission>` is the mission slug and `<module>` is the module slug.

---

## Final report

```
## Delivery complete — <feature name>

Deliverables:
- D1 — <title>: success
- D2 — <title>: success
- D3 — <title>: success

Build: passed
Tests: X/Y passed

Manual tests needed:
- [ ] <action> → <expected result>

Next step: /launchpad:review <repo>/<feature>
```

If there are unresolved failures:
```
Deliverables with issues:
- D3 — <title>: failed after 2 attempts
  Root cause: <diagnosis>
  Suggested next step: <action>
```

If amendment mode was active, the final report should note:
```
## Delivery complete (amendment) — <feature name>

Re-executed deliverables:
- D2 — <title>: success
- D4 — <title>: success

Skipped (from previous delivery):
- D1 — <title>: previously passing
- D3 — <title>: previously passing

Build: passed
Tests: X/Y passed

Next step: /review <repo>/<feature>
```

In amendment mode, skipped deliverables must also be written to results.md with `status: skipped` and `summary: Previously passing`. This ensures results.md is always a complete record of all deliverables regardless of amendment mode.

After successful amendment delivery, **delete review.md** to clear the amendment flag:
```bash
rm ~/.claude/missions/$FEATURE_PATH/review.md
```
This prevents the next `/review` from seeing stale findings.

---

## Rules

| Rule | Detail |
|---|---|
| Plan is the contract | Execute faithfully. Don't add deliverables not in the plan. |
| Parse the DAG | Read execution order from `## Execution DAG`, don't re-derive it. |
| Baseline must pass | Never start on a broken codebase. |
| Gates are opt-in | Only pause at explicit `gate: true` in the DAG. No implicit gates, not even after D1. |
| 2 retries max per deliverable | After 2 failures: stop and report. Don't fix indefinitely. |
| Subagents don't spawn subagents | All orchestration from this thread. |
| Sonnet by default | Never use opus in a subagent without explicit justification in the plan. |
| Structured results | Expect and parse the result schema. Proceed on narrative but note it. |
| Worktree for parallel writes | If two deliverables run in the same batch and modify files, use worktree isolation. |
| Commit per deliverable | Stage only files_changed — never git add -A. Commit immediately after integration. |

---

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Re-deriving execution order from descriptions | Parse the Execution DAG section |
| Launching all sequentially when parallelism is possible | If no shared files: launch in parallel |
| Continuing after 2 failures | Stop and report with full diagnosis |
| Subagent spawning subagent | Not possible — all launches from this thread |
| Ignoring structured result format | Parse task_id, status, errors — don't read as narrative |
| Skipping baseline check | Always verify build + tests before starting |
| Enriching prompt with session context | Only use runtime context block — no session state |
| Leaving changes uncommitted after integration | Commit per deliverable using files_changed from structured result |

---

## When NOT to use

- No plan.md exists → run `/launchpad:planning` first
- Plan not approved by human → get approval first
- Code already implemented and reviewed → run `/launchpad:ship`
- Quick fix that doesn't need orchestration → do it directly
