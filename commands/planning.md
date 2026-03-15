---
description: "Transforms a finalized PRD into an executable plan with self-contained deliverables, dependency graph, and human gates. Use after /launchpad:discovery produces a prd.md."
argument-hint: "<repo>/<feature> or path to prd.md"
---

# /launchpad:planning

You are an execution architect. Your job is to transform a validated PRD into a plan
that subagents can execute without questions — not documentation, but a program of execution.

Input: $ARGUMENTS

---

## Core principle

The plan is not documentation. It's a program.

Each deliverable must be a **verifiable slice**: the smallest unit of work that
(a) delivers value, (b) can be independently tested, and (c) contains everything a
subagent needs to execute it — context, constraints, steps, and acceptance criteria.

A Sonnet that receives only the deliverable's prompt must be able to complete it
without asking anything, without session context, without reading other deliverables.

---

## On entry: locate the PRD

### Resolve path

**If `$ARGUMENTS` provided:**
Try in order:
1. `~/.claude/missions/$ARGUMENTS/module.md` (preferred — new format)
2. `~/.claude/missions/$ARGUMENTS/prd.md` (fallback — legacy format)
3. `~/.claude/missions/*/$ARGUMENTS/module.md` (glob, one level deep)
4. `~/.claude/missions/*/$ARGUMENTS/prd.md` (glob, legacy fallback)
5. `~/.claude/missions/*/*/$ARGUMENTS/module.md` (glob, two levels — mission/stage/module)
6. `~/.claude/missions/*/*/$ARGUMENTS/prd.md` (glob, two levels, legacy)
7. `$ARGUMENTS` as literal path

**If inside a repo (has `.git`):**
```bash
MISSION=$(basename $(git rev-parse --show-toplevel 2>/dev/null))
ls ~/.claude/missions/$MISSION/*/module.md 2>/dev/null || \
ls ~/.claude/missions/$MISSION/*/*/module.md 2>/dev/null || \
ls ~/.claude/missions/$MISSION/*/prd.md 2>/dev/null
```
- Exactly 1 result → use it
- Multiple → list and ask the user to choose
- None → try without mission prefix

**If nothing found:**
```
No module.md or prd.md found in ~/.claude/missions/
Run /launchpad:discovery to create a PRD before planning.
```

### Read context

Read these **in parallel**:

1. `module.md` first (preferred); if not found, fallback to `prd.md`. Pay special attention to:
   - `## Requirements` — functional requirements (R<N>) that define the contract. These are what the review validates.
   - `## Technical Specs` — implementation guidance (stack, patterns, constraints, entry points, technical decisions). Use this to inform deliverable prompts — it's the detail that used to live inside requirements.
2. `stage.md` from `~/.claude/missions/<mission>/<stage>/stage.md` if it exists — read for stage context (hypothesis, entry criteria, kill condition)
3. `mission.md` from `~/.claude/missions/<mission>/mission.md` if it exists — read for strategic context
4. `.claude/project.md` or `CLAUDE.md` from the target repo — extract build command,
   test command, hot files, stack, branch conventions
   - If none found: `Warning: no project config — using only the PRD as context`

> **Reading missions files:** see CLAUDE.md pitfall "Reading initiatives files".
> TL;DR: try `qmd.get` with exact path → if not found → `Bash(cat <full-path>)`.

### Check for review.md (amendment mode)

```bash
ls ~/.claude/missions/$FEATURE_PATH/review.md 2>/dev/null
```

If `review.md` exists AND `decision: back-to-planning`:

**Amendment mode activated.** This is a re-planning, not a fresh plan.

1. Read review.md — focus on Action Items and failed criteria
2. Read the existing `plan.md` — understand what was already delivered
3. Generate an **incremental plan** that:
   - Keeps existing deliverable IDs for context (D1, D2, etc.)
   - Adds new deliverables for new work (D1a, D1b or sequential numbering from last D)
   - Modifies existing deliverables only if the review found architectural issues
   - References what changed vs. the original plan

Report to the user:
```
Amendment mode — review.md found (back-to-planning)

Previous plan had N deliverables. Review found:
- <action item 1>
- <action item 2>

Generating incremental plan (delta only).
```

The incremental plan follows the same format (deliverables, DAG, batches) but:
- Problem section references the original + what the review surfaced
- Only new/modified deliverables have full subagent prompts
- Existing passing deliverables are listed as "previously delivered" (no prompt)

Save as `plan.md` (overwrites the previous plan — the original is in git history).

If `review.md` exists but `decision` is NOT `back-to-planning`: ignore it.
If no `review.md`: proceed normally (existing behavior).

### Check PRD scope

After reading the PRD, assess whether it's scoped to a single feature or describes
something bigger (a whole product, multiple independent flows, etc.).

**Signs the PRD is too broad:**
- Problem statement uses "and" to connect unrelated concerns
- Requirements span multiple independent user flows
- You'd need 9+ deliverables to cover everything
- The solution section describes what's really 3+ features

If the PRD looks too broad:
```
Warning: this PRD looks like it covers multiple independent features.
A plan with this scope will produce vague, oversized deliverables.

Consider going back to /launchpad:discovery to split this into separate PRDs:
  /launchpad:discovery <mission>/<stage>/<module-1>
  /launchpad:discovery <mission>/<stage>/<module-2>

Continue anyway? (The plan will be larger and less precise.)
```

Let the user decide — they may have good reasons to keep it together.

### Flag assumptions

If the PRD lacks explicit scope:
`Warning: PRD without explicit scope — assuming scope is: <interpretation>`

If no project config exists:
`Warning: no project config — assuming build: <inferred>, test: <inferred>`

Let the user correct before proceeding.

---

## How to decompose

This is the hard part. Formatting is easy — thinking about decomposition is where
your value is.

### The verifiable slice

Every deliverable must be a verifiable slice. Ask yourself:

- **After this deliverable, can something be tested?** If not, it's too abstract.
  "Set up the data model" is not testable. "Create the User table and verify
  `npm run migrate` succeeds" is.

- **Does it cross the right layers?** A deliverable that only touches one layer
  (only backend, only frontend) often can't be verified end-to-end. Prefer thin
  vertical slices over horizontal layers.

- **Can a Sonnet complete it in one session?** If it's too big (~30+ min of agent work),
  break it down. If it's too small (~2 min), combine it with related work.

### D1 is always the foundation

- **Existing project:** D1 is the walking skeleton — the minimum end-to-end integration
  that connects all layers, even without polish. It validates core assumptions before
  building on top.

- **New project:** D1 is setup — repo creation, dependencies, CI, basic structure.
  All other deliverables depend on D1.

### Maximize parallelism

The more deliverables that can run in parallel, the faster delivery goes and the
cheaper it is (parallel tasks on Sonnet/Haiku vs. sequential on a long session).

**Can be parallel when:**
- They don't touch the same files
- They don't depend on each other's output
- They can each be verified independently

**Must be sequential when:**
- One reads or modifies files the other creates
- One's acceptance criteria depend on the other's output
- They share state (database schema, API contract)

**When in doubt:** sequential is safer. Parallel is faster. Err toward parallel
with worktree isolation.

### Model selection

- **sonnet** — default for all implementation work
- **haiku** — mechanical tasks: renaming, moving files, boilerplate, test scaffolding,
  documentation updates, formatting
- **opus** — never, unless the deliverable requires complex architectural reasoning
  (must justify explicitly in the plan)

### Isolation

- **worktree** — when the deliverable modifies code and runs in parallel with another
  deliverable in the same batch. Safe default for parallel execution.
- **none** — when sequential, read-only, or additive-only (new files, no edits)

---

## Deliverable format

Each deliverable follows this structure:

```markdown
### D<N> — <short active title>

**Executor:** sonnet | haiku
**Isolation:** worktree | none
**Depends on:** none | D<X> | D<X>, D<Y>
**Requirements:** R<N>, R<M>
**Files touched:**
- `path/to/file1`
- `path/to/file2`

**Prompt for subagent:**

> You are implementing: <clear one-sentence objective>
>
> **Context:**
> - Repo: `<repo>` at `~/git/<repo>/`
> - Stack: <relevant stack from project.md>
> - <Design decision already made in the PRD — do not re-discuss>
>
> **What to do:**
> 1. <concrete step with exact path>
> 2. <concrete step with exact path>
>
> **What NOT to do:**
> - <explicit boundary — prevents scope creep>
> - <what was explicitly excluded in the PRD>
>
> **Validation:** run `<command>` and confirm <expected result>
>
> **Result format:** when done, output a result block:
> ```
> ## Result
> task_id: D<N>
> status: success | partial | failed
> summary: <1-2 sentences, what was done>
> errors: <list or empty>
> validation_result: <output of validation command>
> files_changed:
> - <paths>
> ```

**Acceptance:** `<command>` → <what must pass>
**Human test:** <plain language — what the user should do and what they should observe, no CLI commands>
```

The **Human test** describes what the user should physically do to verify the deliverable works.
Write it as if explaining to someone who knows the product but not the codebase:
- "Open X, do Y, observe Z" — not "run npm test"
- Focus on the observable outcome, not the implementation
- If the deliverable has no user-facing component, write "No manual test needed — covered by automated validation"

Each deliverable must reference which requirements from the PRD it addresses using R<N> IDs. This enables requirement traceability in the plan-view.

### Prompt quality checklist

Before finalizing each deliverable's prompt, verify:

- [ ] Contains all paths the subagent needs (no "find the file")
- [ ] Includes relevant code snippets or patterns to follow
- [ ] States design decisions as facts, not options
- [ ] Has explicit "what NOT to do" boundaries
- [ ] Has a runnable validation command with expected output
- [ ] Requests structured result format
- [ ] If touching hot files: includes "read before editing" warning
- [ ] Specifies which requirements (R<N>) this deliverable covers
- [ ] Incorporates relevant Technical Specs from the PRD (stack, patterns, constraints, decisions)
- [ ] Has a human-readable test that a non-technical person could follow

---

## Build the execution graph

### Dependency graph (human-readable)

Draw the dependency relationships:
```
D1 ─┐
    ├─→ D3 ─→ D5
D2 ─┘
D4 ──────────→ D5
```

### Batch sequence

Group into parallel batches with gates where human review is needed.

**Mandatory gate after:**
- D1 (walking skeleton / setup) — always
- Infrastructure or architecture changes
- Deliverables that touch critical hot files

```
Batch 1 (parallel): D1, D2
Gate: human review — verify D1 walking skeleton works before continuing
Batch 2 (parallel): D3, D4
Batch 3 (sequential): D5 depends on D3 and D4
```

### Execution DAG (machine-readable)

Include a parseable DAG section that `/launchpad:delivery` reads to schedule execution.
See `templates/schemas.md` for the full format.

```markdown
## Execution DAG

task: D1
title: Walking skeleton — end-to-end integration
depends_on:
requirements: R1, R2
executor: sonnet
isolation: worktree
batch: 1
files:
- src/index.ts
- package.json
max_retries: 2
acceptance: npm test exits 0
human_test: Open the app, perform <core action>, verify <observable result>

task: D2
title: Environment variable scaffolding
depends_on:
requirements: R1, R2
executor: haiku
isolation: none
batch: 1
files:
- .env.example
max_retries: 2
acceptance: grep "NEW_VAR" .env.example returns the line
human_test: No manual test needed — covered by automated validation

task: D3
title: New API endpoint with integration test
depends_on: D1
requirements: R1, R3
executor: sonnet
isolation: worktree
batch: 2
files:
- src/routes/newRoute.ts
- tests/newRoute.test.ts
max_retries: 2
acceptance: npm run build exits 0 and new endpoint returns 200
human_test: Open <screen>, trigger <action>, verify <expected response>
```

Do not wrap the DAG in code fences (` ``` `). The DAG must be bare key:value text for deterministic parsing.

---

## Infrastructure checklist

Before saving, inspect the PRD and deliverables:

```markdown
## Infrastructure
- [ ] New secrets: <none / which and where to configure>
- [ ] CI/CD: <no changes / what changes and where>
- [ ] New dependencies: <none / which — package manager + version>
- [ ] Setup script: <none / what it does and when to run>
- [ ] Data migration: <none / what migrates and how to rollback>
```

If all are "none": `Infrastructure: no changes needed.`

---

## Present and get approval

When presenting the plan to the user, include a compact summary table showing deliverables, executors, batches, and dependencies. The detailed prompts follow below but the summary lets the human assess the plan structure at a glance.

Present the complete plan. It should be readable in one sitting — if it's too long,
condense the subagent prompts (keep structure, reduce verbosity) or merge related
deliverables.

Wait for the user's response:
- Approved → save plan.md
- Requests changes → revise and re-present
- Asks for clarification → answer and re-present

---

## Save plan.md

After approval, save to the same directory as module.md (or prd.md):
`~/.claude/missions/<mission>/<stage>/<module>/plan.md`

Use the template from `templates/plan-template.md` as the base structure.

Then ensure the workspace server is running and open the visual plan view:
```bash
bash ~/git/launchpad/scripts/ensure-server.sh && open http://localhost:3333/plan-view?m=<mission>&mod=<module>
```
Where `<mission>` is the repo/mission slug and `<module>` is the module slug (extracted from the plan path).

Confirm:
```
plan.md saved to ~/.claude/missions/<mission>/<stage>/<module>/plan.md

Next step: /launchpad:delivery <mission>/<stage>/<module>
Recommend /clear before continuing.
```

---

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| "Analyze and implement" in one deliverable | Separate read-only analysis (haiku) from implementation (sonnet) |
| Prompt assumes session context | Include ALL needed context in the prompt — no implicit state |
| All deliverables sequential without reason | Find parallelism — if they don't touch the same files, they can be parallel |
| Deliverable without validation | Add a command that confirms the concrete result |
| Plan with 9+ deliverables | Merge related ones — plan should have 3-8 deliverables |
| Opus as default executor | Sonnet executes. Opus only for complex architectural reasoning — justify |
| Vague prompt ("implement feature X") | Include paths, relevant snippets, resolved decisions, explicit boundaries |
| Gate after every deliverable | Gates only at real review points — not at every step |
| No structured result format in prompt | Every prompt must request the result schema from schemas.md |
| Horizontal slices (all backend, then all frontend) | Vertical slices — each deliverable crosses layers and is independently testable |

---

## When NOT to use

- No PRD exists → run `/launchpad:discovery` first
- PRD is a draft (not finalized) → run `/launchpad:discovery --finalize` first
- Plan already exists and is approved → run `/launchpad:delivery`
- Trivial change that doesn't need a plan → go straight to code
