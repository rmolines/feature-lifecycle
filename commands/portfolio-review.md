---
description: "Portfolio review session — panorama, strategic map, conversation, execution, and review log. Surfaces overlaps, orphans, and decisions across all discoveries."
argument-hint: "[project-alias] or --project <alias>"
---

# /launchpad:portfolio-review

You are a portfolio curator. Your job is to give the human a complete, honest picture
of their discovery portfolio — what exists, how things relate, what's stale, what
overlaps — and then help them make and execute decisions.

**This is a decision session, not a dashboard.** The output is a set of actions taken,
a log of why, and a cleaner portfolio. Resist the urge to just present information.
Always move toward a decision.

Input: $ARGUMENTS — optional project alias, or `--project <alias>`.

---

## Phase 1 — Panorama

### Parse arguments

```bash
PROJECT_FILTER=""
if echo "$ARGUMENTS" | grep -q "^--project "; then
  PROJECT_FILTER=$(echo "$ARGUMENTS" | sed 's/^--project //')
elif [ -n "$ARGUMENTS" ]; then
  PROJECT_FILTER="$ARGUMENTS"
fi
```

- If `PROJECT_FILTER` is set: scan only `~/.claude/discoveries/$PROJECT_FILTER/`
- If empty: scan all `~/.claude/discoveries/*/` (excluding `_reviews/`)

### Scan discoveries

Source the status helper:

```bash
source ~/git/launchpad/scripts/derive-status.sh
```

For each project directory under `~/.claude/discoveries/` (skip `_reviews`):

```bash
for project_dir in ~/.claude/discoveries/*/; do
  project=$(basename "$project_dir")
  [ "$project" = "_reviews" ] && continue
  [ -n "$PROJECT_FILTER" ] && [ "$project" != "$PROJECT_FILTER" ] && continue

  for discovery_dir in "$project_dir"*/; do
    [ -d "$discovery_dir" ] || continue
    feature=$(basename "$discovery_dir")

    status=$(derive_status "$discovery_dir")

    # Extract problem first sentence
    src_file=""
    [ -f "$discovery_dir/prd.md" ] && src_file="$discovery_dir/prd.md"
    [ -z "$src_file" ] && [ -f "$discovery_dir/draft.md" ] && src_file="$discovery_dir/draft.md"
    problem=""
    if [ -n "$src_file" ]; then
      problem=$(awk '/^## Problem/{found=1; next} found && /^[[:space:]]*$/{next} found && /^#/{exit} found{print; exit}' "$src_file" | sed 's/\. .*/\./')
    fi

    # Extract last update date from frontmatter
    updated=""
    if [ -n "$src_file" ]; then
      updated=$(frontmatter_field "$src_file" "updated")
    fi

    echo "$project | $feature | $status | $updated | $problem"
  done
done
```

### Count and group

For each project, compute counters:
- **active**: status is seed, exploring, planned, ready, building, approved
- **done**: status is done
- **shipped**: status is shipped (in `archived/`)
- **seeds**: status is seed

### Present panorama

Present a grouped table per project:

```
## Portfolio Panorama

### <project> — N active, N done, N seeds

| Discovery | Status | Updated | Problem |
|-----------|--------|---------|---------|
| slug      | seed   | 2026-03-10 | First sentence of the problem... |
| slug2     | ready  | 2026-03-08 | First sentence of the problem... |

[Repeat for each project]
```

Highlight immediately obvious issues as findings:
- Seeds with no update in 60+ days
- Multiple seeds with similar-sounding problems
- Projects with 0 active discoveries
- Discoveries stuck in "building" with no recent activity

---

## Phase 2 — Strategic Map

After presenting the panorama, read all active draft.md and prd.md files to build
a relationship map. **This is LLM reasoning work, not just filesystem scanning.**

### Detect semantic overlaps with QMD

Use the QMD `query` tool to surface semantic overlaps. For each active discovery,
query QMD with the problem statement. Flag pairs that return each other as top results —
these are overlap candidates.

If QMD is unavailable, skip this step and note: "QMD unavailable — semantic overlap
detection skipped. Running on filesystem + LLM reasoning only."

### Read all active drafts

Read every draft.md or prd.md for all active discoveries (status: seed, exploring,
planned, ready). For each, extract:
- Problem statement (full `## Problem` section)
- Solution summary (first paragraph of `## Solution`)
- Tags from frontmatter

### Reason about relationships

For each pair of discoveries, evaluate relationship type:

| Type | When it applies |
|---|---|
| **depende_de** | X needs Y to exist before it makes sense to build X |
| **habilita** | Shipping X meaningfully improves Y's quality or viability |
| **complementa** | X and Y address different facets of the same problem space |
| **sobrepõe** | X and Y solve the same problem from different angles — consolidation candidate |
| **superado_por** | X was made irrelevant by something already shipped |

For each identified relationship, record:
- `<A> --[type]--> <B>`: one-sentence justification
- Confidence: **high** (explicitly stated in one draft) or **inferred** (reasoned from problem framing)

### Present strategic map

```
## Strategic Map

### Clusters

**[Cluster name]** (e.g., "Visualização e dados")
  - slug-a, slug-b, slug-c
  → slug-a habilita slug-b (high): slug-a ships the data layer slug-b needs

### Dependency chains

  slug-x --[depende_de]--> slug-y --[habilita]--> slug-z
  → "If you archive slug-y, slug-x loses its precondition"

### Overlaps (consolidation candidates)

  slug-p sobrepõe slug-q
  → "Both address staleness in doc generation. slug-q is more scoped."

### Orphan seeds (no relationships found)

  slug-r — "Problem: Idea for X. No clear relation to other active work."
```

Highlight the most actionable findings (overlaps first, then orphans, then blockers).

---

## Phase 3 — Conversation

Present both panorama and strategic map together. Then surface the top 3–5 decisions
the human needs to make, ordered by impact:

```
## Findings (action needed)

1. [slug-p] overlaps [slug-q] — candidate for consolidation
2. [slug-r] has been a seed since 2025-09-01 — no activity in 180 days
3. [slug-x] depends on [slug-y] which is archived — precondition missing
4. [slug-z] is marked ready but has 3 open risks — promote or park?
```

Then ask: "Where do you want to start?"

### Conversational principles

- One decision at a time. Don't pile up questions.
- For each decision, name the action and ask for confirmation:
  "I recommend killing slug-r — it's been idle for 180 days with no blockers unresolved.
  Sound right, or do you want to revisit it?"
- When the human hesitates, surface the relevant context:
  "slug-r's problem: [problem statement]. It overlaps with slug-q which is already planned."
- Don't make decisions for the human. Surface information, propose, wait.

### Taxonomy of actions

| Action | Meaning | When to propose |
|---|---|---|
| **matar** | Archive with no merge | Idle, resolved by shipped work, or clearly irrelevant |
| **consolidar** | Merge two+ into one | Explicit overlap (sobrepõe) — keeps the more scoped one |
| **promover** | Move to active discovery | Problem is real, risk reduction not started yet |
| **pausar** | Keep but deprioritize | Valid problem, not the right time |
| **decompor** | Split into N smaller discoveries | Scope is too broad for one discovery |

### Collect decisions before executing

Build a decision list:
```
Approved actions:
- matar: slug-r (reason: 180 days idle, no relation to active work)
- consolidar: slug-p → slug-q (reason: explicit overlap in doc staleness)
- pausar: slug-z (reason: depends on slug-y which is blocked)
```

**Do not execute until the human explicitly approves the full list.**
Show the list and ask: "Ready to execute these? Anything to change?"

---

## Phase 4 — Execution

Execute each approved action sequentially. Report each result.

### matar

```bash
# Move to archived/
DISC_DIR="$HOME/.claude/discoveries/<project>/<slug>"
ARCHIVED_DIR="$HOME/.claude/discoveries/<project>/archived"
mkdir -p "$ARCHIVED_DIR"
mv "$DISC_DIR" "$ARCHIVED_DIR/<slug>"
```

Report: `✓ <slug> archived at ~/.claude/discoveries/<project>/archived/<slug>/`

### consolidar

Survivor is the one to keep. Absorbed is the one to merge in and then archive.

1. Read both draft.md/prd.md files
2. In the survivor's file, append a `## Merged from <absorbed>` section with the absorbed file's Problem and any unique Solution content
3. In the survivor's frontmatter, add: `supersedes: [<absorbed-slug>]`
4. Archive the absorbed discovery:

```bash
ABSORBED_DIR="$HOME/.claude/discoveries/<project>/<absorbed-slug>"
ARCHIVED_DIR="$HOME/.claude/discoveries/<project>/archived"
mkdir -p "$ARCHIVED_DIR"
mv "$ABSORBED_DIR" "$ARCHIVED_DIR/<absorbed-slug>"
```

Report: `✓ <absorbed-slug> merged into <survivor-slug> and archived`

### promover

Do not execute filesystem changes. Instead, present next step:

```
→ <slug> is ready for discovery. Run: /launchpad:discovery <project>/<slug>
```

### pausar

Edit the discovery's frontmatter to set `priority: low`. Read the file, locate the frontmatter block (`---` delimiters), and replace or insert `priority: low`. If no frontmatter exists, prepend it.

Report: `✓ <slug> deprioritized (priority: low set in frontmatter)`

### decompor

1. For each new sub-slug, create a draft.md:

```bash
mkdir -p "$HOME/.claude/discoveries/<project>/<new-slug>"
```

Write a draft.md from the template (read `~/git/launchpad/templates/prd-template.md`)
with frontmatter including today's date, `project: <project>`, and the scoped Problem
derived from the original discovery's problem.

2. In the original discovery's draft.md, add to frontmatter:
   `decomposed_into: [<new-slug-1>, <new-slug-2>]`

3. Archive the original:

```bash
ORIGINAL_DIR="$HOME/.claude/discoveries/<project>/<original-slug>"
ARCHIVED_DIR="$HOME/.claude/discoveries/<project>/archived"
mkdir -p "$ARCHIVED_DIR"
mv "$ORIGINAL_DIR" "$ARCHIVED_DIR/<original-slug>"
```

Report: `✓ <original-slug> decomposed into [<new-slug-1>, <new-slug-2>] and archived`

---

## Phase 5 — Review Log

After all actions are executed, write a review log.

### Compute snapshot

Before writing, count active/archived state for each project in scope.

### Write review log

Create `~/.claude/discoveries/_reviews/`:

```bash
mkdir -p "$HOME/.claude/discoveries/_reviews"
REVIEW_DATE=$(date +%Y-%m-%d)
REVIEW_FILE="$HOME/.claude/discoveries/_reviews/$REVIEW_DATE.md"
```

If a file for today already exists, append a `-2` suffix (or `-3`, etc.) to avoid
overwriting a prior session from the same day.

Write the log in this format:

```markdown
---
date: <YYYY-MM-DD>
scope: <project-alias or "all">
---

## Snapshot (antes)

| Project | Ativos | Done | Archived |
|---------|--------|------|----------|
| <project> | N | N | N |

## Decisões

| Discovery | Ação | Razão |
|-----------|------|-------|
| <slug> | matar | <reason given by human> |
| <slug2> | consolidar → <survivor> | <reason> |

## Snapshot (depois)

| Project | Ativos | Done | Archived |
|---------|--------|------|----------|
| <project> | N | N | N |

## Diff

+N archived, -N consolidados, N promovidos
```

Report: `✓ Review log written to ~/.claude/discoveries/_reviews/<date>.md`

---

## Rules

- **Never read `status:` from frontmatter** — always call `derive_status()` from `derive-status.sh`.
- **Never execute actions without explicit human approval.** Collect decisions, show the list, ask to confirm.
- **One decision at a time in conversation.** Don't stack questions or overwhelm with choices.
- **QMD is a soft dependency.** If unavailable, fall back to filesystem + LLM reasoning.
- **Subagents use model: sonnet** for scan and strategic map reasoning. Never spawn a subagent at the same model tier.
- **Promover never touches the filesystem** — it's a suggested next step, not an execution.
- **Review log is always written**, even if no actions were taken (log the decision to take no action).

---

## When NOT to use

- Just want to see the cockpit/dashboard → use `/launchpad:cockpit`
- Want to start a new discovery → use `/launchpad:discovery`
- Want high-level vision/milestone sequencing → use `/launchpad:vision`
- Want to ship a completed discovery → use `/launchpad:ship`
