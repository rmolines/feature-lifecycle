# Skill Contracts

Reference document defining the input/output contracts, value proposition, and design intent
for each skill in the launchpad plugin.

---

## Design principles

### Risk reduction as the core loop

Discovery is a risk reduction engine. Risks come in two flavors:

- **Communication risks** (happen during the conversation, not as separate cycles):
  - Human doesn't know what they want (extraction)
  - Human knows but can't articulate (translation)
  - LLM misunderstood (interpretation validation)

- **Initiative risks** (become investigation cycles):
  - Idea might be bad (kill condition)
  - Technical feasibility
  - Usability / UX
  - Business / market

### Thin slice as the unit of planning

Each deliverable in a plan should be a **minimum testable unit of value**: not just small,
but verifiable. After each deliverable, something works and can be tested. This drives both
decomposition granularity and validation design.

### What makes a PRD good for agents

A PRD is good for agent execution when:

1. **Problem is falsifiable** — you can tell if it was solved or not
2. **Success criteria are concrete** — not "works well", but "user can do X in Y steps"
3. **Out-of-scope is specific enough that the agent won't get close** — not "don't do unnecessary things", but "don't implement Z, don't touch W"
4. **Design decisions are already made** — the agent doesn't choose between options, the PRD already chose
5. **Relevant technical context is included** — stack, constraints, project patterns

`/discovery --finalize` should validate the PRD against this checklist before generating `prd.md`.
If it fails, point out what's weak and propose another cycle.

### Ship = orchestration, not execution

Ship has two layers:

- **Orchestration** (what to do, in what order, when to stop) → lives in the skill
- **Execution** (build, test, PR, deploy, cleanup) → lives in the project (Makefile or equivalent)

The skill should call project-defined targets (`make ship-pr`, `make ship-deploy`, etc.)
rather than hardcoding bash commands. Each project customizes the targets.
`project.md` points to the Makefile or equivalent.

---

## Contracts

### `/discovery`

```
INPUT:   idea, context, user data (vague or structured)
OUTPUT:  prd.md (validated against quality checklist)
VALUE:   clarity + kill bad ideas early
WHO:     human (decisions) assisted by agent (research, questioning, structuring)
```

The agent is a sparring partner, not a form to fill. Communication risks (extraction,
translation, interpretation) are handled organically through conversation, not as
procedural steps. Initiative risks (technical, UX, business) become explicit investigation cycles.

Discovery should feel like talking to a co-founder who questions, researches, and
structures alongside you.

### `/planning`

```
INPUT:   prd.md
OUTPUT:  plan.md (self-contained deliverables, parallelizable, each = testable thin slice)
VALUE:   confidence before spending tokens
WHO:     50/50 — agent decomposes, human validates
```

The skill should teach the agent *how* to decompose, not just format the output.
Key heuristics:
- Each deliverable = minimum testable unit of value
- Maximize parallelization with cheaper models (sonnet/haiku)
- Worktree isolation when deliverables touch the same files
- Walking skeleton as D1 (validates core assumptions before building on top)

### `/delivery`

```
INPUT:   plan.md
OUTPUT:  code on branch, build + tests passing
VALUE:   automatic execution, human only approves gates
WHO:     agent (100%)
```

The most mechanical skill. Value is in being automatic, not in being intelligent.
If the plan is good, delivery is straightforward execution.

### `/review`

```
INPUT:   git diff + prd.md + plan.md
OUTPUT:  decision — back to planning | back to delivery | approved for ship
VALUE:   structured push-back, informed decision
WHO:     agent analyzes, human decides
```

Review is a **decision gate**, not a quality checklist. Three possible outcomes:
- **Back to planning** — something fundamental changed or was wrong
- **Back to delivery** — implementation gaps, need more work
- **Approved for ship** — aligned with PRD, ready to go

Simplify moves to `/ship` (polish before merge, not during review).

### `/ship`

```
INPUT:   approved code + project config (Makefile / project.md)
OUTPUT:  PR merged + deploy verified + docs + cleanup
VALUE:   finer details that solo devs procrastinate, consistent quality
WHO:     agent (100%), human confirms deploy
```

Ship is where external structure helps the most. The better ship is designed,
the higher the baseline quality of every project that uses it.

Responsibilities: PR + CI + deploy + smoke test + simplify + docs (HANDOVER, CHANGELOG,
LEARNINGS, CLAUDE.md pitfalls) + cleanup (archive discovery, remove worktree).

Project-specific execution should be delegated to Makefile targets or equivalent.

---

## State machine

```
                    ┌─────────────┐
                    │  /discovery  │
                    │  (prd.md)   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
              ┌─────│  /planning   │
              │     │  (plan.md)  │
              │     └──────┬──────┘
              │            │
              │     ┌──────▼──────┐
              │     │  /delivery   │
              │     │  (code)     │
              │     └──────┬──────┘
              │            │
              │     ┌──────▼──────┐
              ├─────│   /review    │──────┐
              │     │ (decision)  │      │
              │     └──────┬──────┘      │
              │            │             │
 back to      │     ┌──────▼──────┐      │ back to
 planning     │     │    /ship     │      │ delivery
              │     │ (production)│      │
              │     └──────┬──────┘      │
              │            │             │
              │     ┌──────▼──────┐      │
              │     │   archived   │      │
              │     └─────────────┘      │
              └──────────────────────────┘
```

File presence determines state:
- `draft.md` → discovery in progress
- `prd.md` → ready for planning
- `prd.md` + `plan.md` → ready for delivery
- code on branch → ready for review
- `archived/` → done
