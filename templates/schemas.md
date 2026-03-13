# Schemas

Three machine-readable formats used across the launchpad plugin skills.

---

## Schema 1: Structured Result (subagent → orchestrator)

Every subagent spawned by `/delivery` must return its result in this format. The orchestrator parses it to decide next steps: proceed to next batch, retry the task, or escalate to the human.

### Format

```
## Result

task_id: D1
status: success
summary: Implemented the JWT middleware and wired it into the Express router. All protected routes now reject unauthenticated requests.
errors:
validation_result: PASS — 42 tests passed, 0 failed (npm test)

files_changed:
- src/middleware/auth.ts
- src/routes/index.ts
- tests/middleware/auth.test.ts
```

### Field rules

| Field | Type | Rules |
|---|---|---|
| `task_id` | string | Must match a deliverable ID in plan.md (e.g. `D1`, `D2`, `M1`) |
| `status` | enum | `success` / `partial` / `failed` |
| `summary` | string | 1–2 sentences. What was done, not what was attempted. Past tense. |
| `errors` | list or empty | One error per line, prefixed with `- `. Empty if status is `success`. |
| `validation_result` | string | Verbatim output or summary of the validation command defined in the plan. Include pass/fail verdict. |
| `files_changed` | list | One path per line, prefixed with `- `. Paths relative to repo root. |

### Status semantics

- **success** — validation passed, task is complete. Orchestrator proceeds.
- **partial** — core logic done but validation did not fully pass (e.g. 1 flaky test). Orchestrator may retry or escalate.
- **failed** — task could not be completed or validation failed. Orchestrator retries up to `max_retries`, then escalates to human.

### Parsing (grep/awk)

```bash
STATUS=$(grep "^status:" result.md | awk '{print $2}')
TASK_ID=$(grep "^task_id:" result.md | awk '{print $2}')
FILES=$(awk '/^files_changed:/{found=1; next} found && /^- /{print substr($0,3)} found && /^$/{exit}' result.md)
```

---

## Schema 2: Execution DAG in plan.md

The `## Execution DAG` section is a machine-readable declaration of all deliverables, their dependencies, and execution parameters. It coexists with the human-readable `## Batches` and ASCII graph sections — it does not replace them.

`/delivery` reads this section to build the execution graph, determine batch order, and configure each subagent.

### Format

Add this section to `plan.md` after `## Batches`:

```markdown
## Execution DAG

<!-- DAG format: one task per block, fields are key: value -->

task: D1
title: Set up JWT auth middleware
depends_on:
executor: haiku
isolation: none
batch: 1
files: src/middleware/auth.ts, src/routes/index.ts
max_retries: 2
acceptance: npm test -- --testPathPattern=auth passes with 0 failures

task: D2
title: Add protected routes
depends_on: D1
executor: sonnet
isolation: worktree
batch: 2
files: src/routes/protected.ts, tests/routes/protected.test.ts
max_retries: 1
acceptance: npm run build exits 0 and bundle size < 500kB

task: M1
title: Verify integration and regressions
depends_on: D1, D2
executor: sonnet
isolation: worktree
batch: 3
files: tests/integration/auth.test.ts
max_retries: 2
acceptance: npm test exits 0, no regressions vs baseline

task: D3
title: Update documentation
depends_on:
executor: haiku
isolation: none
batch: 1
files: README.md, docs/auth-setup.md
max_retries: 3
acceptance: migration runs without error on empty DB and on seed DB
```

### Field rules

| Field | Type | Rules |
|---|---|---|
| `task` | string | Unique deliverable ID. Must match IDs used in the Batches section. |
| `title` | string | Short human-readable title for the deliverable (matches `### D<N> — <title>`). |
| `depends_on` | string or empty | Comma-separated list of task IDs that must have `status: success` before this task runs. Leave empty for no dependencies (first batch). |
| `executor` | enum | `haiku` (mechanical, well-scoped) / `sonnet` (reasoning required, integrations) |
| `isolation` | enum | `worktree` (changes need isolation from main branch) / `none` (safe to work in current branch) |
| `batch` | int | Which batch this task belongs to. Tasks in the same batch run in parallel. |
| `files` | string | Comma-separated list of key files touched. Brief — for human overview, not exhaustive. |
| `max_retries` | int | How many times orchestrator retries on `failed` before escalating. Typical range: 1–3. |
| `acceptance` | string | The exact command or assertion used to validate completion. Must be runnable. |

### Isolation guidance

Use `worktree` when:
- The task touches shared infrastructure (router, DB schema, auth layer)
- Parallel tasks in the same batch could conflict on the same files
- You want a clean rollback if the task fails

Use `none` when:
- Task is additive only (new file, new test, new migration)
- Task is sequential and no parallel task touches overlapping files

### Parsing (grep/awk)

```bash
# Extract all task IDs
TASKS=$(awk '/^## Execution DAG/{found=1} found && /^task:/{print $2}' plan.md)

# Extract fields for a specific task (e.g. D1)
get_field() {
  local task_id=$1 field=$2
  awk -v tid="$task_id" -v f="$field" '
    /^task:/ { current = $2 }
    current == tid && $0 ~ "^" f ":" { sub(/^[^:]+: ?/, ""); print; exit }
  ' plan.md
}

EXECUTOR=$(get_field D1 executor)
DEPENDS=$(get_field D1 depends_on)
TITLE=$(get_field D1 title)
BATCH=$(get_field D1 batch)
FILES=$(get_field D1 files)
ACCEPTANCE=$(get_field D1 acceptance)
```

---

## Schema 3: PRD Quality Checklist

`/discovery --finalize` runs this checklist before writing `prd.md`. Each item has a binary pass/fail. If any item fails, the skill reports it to the human and does not generate the PRD until resolved.

The goal is to produce PRDs that an agent can execute without making product decisions.

---

### Item 1: Problem is falsifiable

**Check:** Can you state a concrete condition that proves the problem is solved?

| | Example |
|---|---|
| **Fail** | "Users are frustrated with onboarding" |
| **Pass** | "35% of signups abandon before completing profile setup (step 3 of 4)" |

**Validation prompt for `/discovery`:** Does the problem statement include a measurable current state (metric, user action, error rate, frequency) that the solution will change?

---

### Item 2: Success criteria are concrete

**Check:** Each criterion must reference a specific user action, system output, or measurable threshold — not a quality adjective.

| | Example |
|---|---|
| **Fail** | "Onboarding should feel fast and intuitive" |
| **Pass** | "User completes profile setup in ≤ 3 steps without leaving the page" |
| **Fail** | "The API should be reliable" |
| **Pass** | "Endpoint returns 200 in < 300ms at p95 under 100 concurrent requests" |

**Validation prompt for `/discovery`:** Read each success criterion. Does it contain a verb + object + threshold? Remove all adjectives — does the sentence still have meaning?

---

### Item 3: Out-of-scope is specific enough

**Check:** Out-of-scope items must name the thing being excluded, not just the category.

| | Example |
|---|---|
| **Fail** | "Mobile is out of scope" |
| **Pass** | "iOS and Android native apps are out of scope. The web app must be responsive down to 375px but native builds are not part of this feature." |
| **Fail** | "Performance optimization is out of scope" |
| **Pass** | "DB query optimization and caching layer are out of scope. The feature must not regress existing p95 latency by more than 10%." |

**Validation prompt for `/discovery`:** For each out-of-scope item, would an agent working on adjacent code know to stop when it encounters it? Or could the agent reasonably argue it's in scope?

---

### Item 4: Design decisions are already made

**Check:** The PRD must not leave open questions that require product or UX judgment. Every fork must be resolved.

| | Example |
|---|---|
| **Fail** | "We could use OAuth or magic links — TBD" |
| **Pass** | "Authentication uses magic links only. OAuth is explicitly out of scope (see §3)." |
| **Fail** | "Error messages should be user-friendly (exact copy TBD)" |
| **Pass** | "Error messages use the copy defined in `docs/error-copy.md`. If a case is not covered, use: 'Something went wrong. Try again or contact support.'" |

**Validation prompt for `/discovery`:** Search the PRD for: "TBD", "to be decided", "could", "might", "or", "option". Each occurrence must be resolved before proceeding.

---

### Item 5: Technical context is included

**Check:** The PRD must include enough context for the agent to make implementation decisions without researching the codebase from scratch.

Required context:

- **Stack** — languages, frameworks, runtime versions relevant to this feature
- **Patterns** — existing patterns the feature must follow (e.g. "all DB access goes through the repository layer in `src/db/`")
- **Constraints** — anything the agent must not violate (e.g. "no new dependencies without approval", "must work without migrations in prod")
- **Entry points** — where in the codebase the feature connects (files, modules, API routes)

| | Example |
|---|---|
| **Fail** | "Use the existing auth system" |
| **Pass** | "Auth is handled by `src/middleware/auth.ts` (JWT, RS256). All protected routes pass through this middleware. The user object is available at `req.user` with shape defined in `src/types/user.ts`." |

**Validation prompt for `/discovery`:** If you gave this PRD to an agent with no other context, could it identify (a) which files to edit, (b) which patterns to replicate, and (c) which constraints to respect?

---

### Checklist summary

```
PRD Quality Gate
----------------
[ ] 1. Problem is falsifiable (measurable current state)
[ ] 2. Success criteria are concrete (user action + threshold, no adjectives)
[ ] 3. Out-of-scope is specific (named things, not categories)
[ ] 4. Design decisions are resolved (no TBDs, no open forks)
[ ] 5. Technical context is included (stack, patterns, constraints, entry points)

Result: PASS (all 5) | FAIL (list failing items)
```

If result is FAIL, `/discovery --finalize` outputs which items failed with the specific gaps found, and prompts the human to resolve them before retrying.

---

## Schema 4: Review Findings (review.md)

`/review` writes this file after every evaluation. Downstream skills (`/discovery`, `/planning`, `/delivery`) read it on entry to detect amendment mode.

### Format

```markdown
# Review Findings
_Feature: <repo>/<feature>_
_Date: <date>_
_Diff analyzed: <git ref range>_

## Decision
decision: approved | back-to-delivery | back-to-planning | back-to-discovery
reason: <1-2 sentence justification>

## Success Criteria Status
| Criterion | Status | Note |
|-----------|--------|------|
| <criterion text> | PASS / PARTIAL / FAIL | <evidence or gap> |

## Action Items
Items that the next phase must address. Each item is self-contained — the receiving skill should be able to act on it without session context.
- <specific, actionable item with file paths where relevant>

## Evaluator Summary
<Key findings from the evaluator subagent — condensed for downstream consumption>
```

### Field rules
| Field | Rules |
|---|---|
| `decision` | One of: `approved`, `back-to-delivery`, `back-to-planning`, `back-to-discovery` |
| `reason` | Must explain *why* this decision, not just restate the criteria status |
| Action Items | Each item must be actionable without session context. Include file paths. |

### Parsing
```bash
DECISION=$(grep "^decision:" review.md | awk '{print $2}')
```

---

## Schema 5: Delivery Results (results.md)

`/delivery` writes this file after all batches complete. It persists the per-deliverable results that would otherwise be lost when the chat session ends. Saved to `~/.claude/discoveries/<repo>/<feature>/results.md`.

### Format

```markdown
task: D1
status: success
summary: Implemented JWT middleware and wired into Express router
files_changed: src/middleware/auth.ts, src/routes/index.ts
validation_result: 42 tests passed, 0 failed

task: D2
status: partial
summary: Template updated but missing tags field
files_changed: templates/prd-template.md
errors: tags field not included in frontmatter
validation_result: head -10 shows 5/6 fields

task: D3
status: failed
summary: Migration script could not complete
files_changed:
errors: DB connection timeout, cannot reach seed DB
validation_result: migration failed at step 2, rollback executed

task: M1
status: success
summary: Verified integration and confirmed no regressions
files_changed: tests/integration/auth.test.ts
validation_result: all tests passed, coverage 94%
```

### Field rules

| Field | Type | Rules |
|---|---|---|
| `task` | string | Matches a deliverable ID in the Execution DAG (e.g. `D1`, `D2`, `M1`) |
| `status` | enum | `success` / `partial` / `failed` / `skipped` |
| `summary` | string | Past tense, 1–2 sentences. What was done (or not done). |
| `files_changed` | string or empty | Comma-separated paths. Empty if no files were touched. |
| `errors` | string or empty | Description of what went wrong. Only when status != `success`. Leave empty otherwise. |
| `validation_result` | string | Output of the acceptance command or summary of what was verified. |

### Status semantics

- **success** — validation passed, task is complete.
- **partial** — core logic done but validation did not fully pass (e.g. 1 flaky test). May be retried or escalated to human.
- **failed** — task could not be completed or validation failed after max_retries.
- **skipped** — task was not run (e.g. because a dependency failed).

### Parsing (grep/awk)

```bash
# Extract all task IDs and their status
awk '/^task:/ {task=$2} /^status:/ {print task, $2}' results.md

# Extract fields for a specific task (e.g. D1)
get_result_field() {
  local task_id=$1 field=$2
  awk -v tid="$task_id" -v f="$field" '
    /^task:/ { current = $2 }
    current == tid && $0 ~ "^" f ":" { sub(/^[^:]+: ?/, ""); print; exit }
  ' results.md
}

STATUS=$(get_result_field D1 status)
SUMMARY=$(get_result_field D1 summary)
ERRORS=$(get_result_field D1 errors)
```

---

## Schema 6: Vision (vision.md)

`/launchpad:vision` writes this file as the strategic layer above feature-level PRDs.
It's consumed by the human (via mission control HTML) and by `/discovery` for context.
Milestone status is **not** stored in vision.md — it's computed from the filesystem.

### Format

```markdown
---
id: <project-slug>
status: draft | validated | active | paused | archived
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
tags: []
---
# Vision: <name>

## Thesis
<One falsifiable sentence: who, what hurts, why now>

### Kill condition
<What proves the thesis wrong>

## Audience
- **Primary:** <who and why>
- **Secondary:** <who and why>

## Milestones

### M1: <name>
- **Hypothesis:** <hypothesis this milestone validates>
- **Entry:** /launchpad:discovery <project>/<milestone-slug>
- **Depends on:** <nothing or M-previous>
- **Kill condition:** <what kills this milestone>

### M2: <name>
...

## Strategy
- **Platform:** <what and why>
- **Monetization:** <how it sustains, even if "free for now">
- **Distribution:** <how users find it>

## Risks validated

| Risk | Type | Method | Decision | Artifact |
|---|---|---|---|---|
| <risk> | market / technical / distribution / business | research / spike / analysis / interview | <decision> | cycles/<NN>-<type>-<desc>/ |

## Risks accepted
- <risk> — accepted because <reason>

## Investigation cycles

| # | Type | Description | Date |
|---|---|---|---|
| 01 | framing | <desc> | <date> |
```

### Field rules

| Field | Rules |
|---|---|
| `id` | Project slug. Used in filesystem paths: `~/.claude/discoveries/<id>/` |
| `status` | `draft` (in progress), `validated` (finalized), `active` (milestones being executed), `paused`, `archived` |
| Milestone `Entry` | Must be a valid `/launchpad:discovery` command that the human can copy-paste |
| Milestone `Depends on` | References other milestone IDs (M1, M2...) or empty for no dependencies |
| Milestone `Blockers` | Checklist of risks/spikes that must be resolved in `/discovery` before the milestone can proceed. These become the first investigation cycles in discovery. |
| Kill condition | Must be falsifiable — something that could actually be true |

### Milestone status (computed, not stored)

Milestone status is derived from the filesystem, not from vision.md:

```bash
PROJECT="ciclosp"
for ms_dir in ~/.claude/discoveries/$PROJECT/*/; do
  ms=$(basename "$ms_dir")
  [ "$ms" = "cycles" ] && continue
  if [ -d "$ms_dir/archived" ]; then echo "$ms: archived"
  elif [ -f "$ms_dir/prd.md" ]; then echo "$ms: prd ready"
  elif [ -f "$ms_dir/draft.md" ]; then echo "$ms: discovery in progress"
  else echo "$ms: not started"
  fi
done
```

### Vision Quality Gate

6 items, all must pass before `status: validated`:

```
Vision Quality Gate
-------------------
[ ] 1. Thesis is falsifiable (concrete condition that proves it wrong)
[ ] 2. Kill condition is honest (not a strawman)
[ ] 3. Milestones sequenced by risk (highest uncertainty earliest)
[ ] 4. Each milestone has independent value (can stop after any one)
[ ] 5. Strategy decisions are explicit (no TBDs)
[ ] 6. Audience is specific enough to design for
```

### Parsing

```bash
# Read thesis
THESIS=$(awk '/^## Thesis/{found=1; next} found && /^$/{exit} found{print}' vision.md | head -1)

# Read status
STATUS=$(grep "^status:" vision.md | head -1 | sed 's/^status: //')

# List milestone slugs (from Entry field)
MILESTONES=$(grep "^\- \*\*Entry:\*\*" vision.md | sed 's/.*discovery [^ ]*//' | awk -F'/' '{print $NF}')
```
