# launchpad

**One developer. A squad of agents. Zero tickets.**

Claude Code collapsed an entire engineering squad into one person. A solo founder with agents can now PM, design, build, test, and ship — all from the terminal. But nobody redesigned the process for this new paradigm.

Linear, Jira, GitHub Projects, sprints, boards — all of it was built as **coordination protocols between humans**. Assignees, story points, standups: infrastructure for multiple people not stepping on each other. The solo builder with agents doesn't have that problem. Their problem is different: **where to put attention right now.**

launchpad is project management redesigned from scratch for the human + agents world. Artifacts on disk replace tickets. Gates replace meetings. The PRD is an execution contract, not a political alignment document. And five commands take a vague idea to production.

## The problem

You're a technical founder. You have 5 projects, 12 features in flight, each at a different stage. Claude Code gives you near-unlimited build capacity. But:

- **You open the terminal and don't know where to start.** Which feature needs attention? Which one is blocked? Which can run on its own?
- **The agent executes, but executes what?** Without clear scope, it invents features, refactors code that didn't need it, adds abstractions for problems that don't exist.
- **Nobody pushes back.** In a squad, the dev questions the PM: "this is underspecified." The designer pushes: "this doesn't make sense for the user." Agents don't question — they execute. When the result is wrong, you spend more time course-correcting than you saved.
- **Existing tools don't help.** Creating a Linear ticket for an agent to execute is overhead with no value. The agent doesn't need a kanban board — it needs a prompt with context.

The bottleneck isn't build capacity. **The bottleneck is human attention and judgment** — spread across multiple projects and parallel features.

## The thesis

### Process as an attention protocol

In the old model, process = communication protocol between humans. In the new model, process = **attention protocol for one person**. Each launchpad command focuses the human on the gate that matters and delegates the rest to agents.

### The PRD is where humans add the most leverage

Before, a 70% good PRD worked because humans on the other side would interpret, fill gaps, push back on ambiguity. Now, **the PRD needs to be 95% good because the agent executes literally what's written.** Out-of-scope becomes a hard constraint, not a suggestion. Success criteria become a verifiable checklist, not an aspiration.

That's why `/discovery` exists: it's not bureaucracy — it's where human judgment has the highest ROI. Investigation cycles, mockups, spikes, all converging on a PRD that works as an execution contract.

### Features are initiatives, not tasks

Each feature is a falsifiable hypothesis with a kill condition. `/discovery` exists to kill bad ideas early, not to document decisions already made. Each investigation cycle reduces risk before committing code.

### Push-back is designed into the process

Without a human squad, the system needs to create the friction points that used to come from people questioning each other. `/discovery` pushes back against vague assumptions. `/review` pushes back against code that deviates from the PRD. The entire process is designed so that **the system finds you** when something needs attention — not the other way around.

## Old world vs. new world

| Old world (PM + squad) | New world (solo + agents) | In the plugin |
|---|---|---|
| Linear ticket | Self-contained prompt with context | `plan.md` with deliverables |
| Sprint planning | Portfolio of initiatives | `~/.claude/discoveries/` with file-based state |
| Peer code review | Validation against contract | `/review` diffs against PRD |
| Daily standup | Deterministic state | File presence = feature state |
| PRD to align stakeholders | PRD as execution spec | `/discovery` with iterative cycles |
| Retrospective | Automated learnings | `/ship` generates LEARNINGS.md |
| "Hey, pick up this task" | Agent with self-contained prompt | `/delivery` launches parallel subagents |
| Designer pushes back | Gates push back | `/review` blocks out-of-scope violations |

## The cycle

```
  Vague idea          Validated PRD        Executable plan        Code                Verified code         In production
       │                    │                     │                  │                       │                   │
       ▼                    ▼                     ▼                  ▼                       ▼                   ▼
  /discovery ──────► /planning ──────► /delivery ──────► /review ──────► /ship
       │                    │                     │                  │                       │
   draft.md              prd.md              plan.md            git diff              PR merged
   prd.md                                                      report                docs generated
                                                                                     archived/
```

Five commands, five transitions. Each command does exactly one thing. Each `→` is a `/clear`. The artifact on disk is the only contract between stages.

### `/discovery [slug | idea | --finalize]`

Iterative risk elimination. Transforms a vague idea into a validated PRD through investigation cycles.

- **Triage modes:** Extraction (loose signals) / Validation (clear hypothesis) / Synthesis (abundant data)
- **Cycle types:** framing, research, mockup (HTML+Tailwind), spike, interview, analysis
- **Scope decomposition:** if an idea is actually multiple features, discovery splits them into independent drafts — each with its own lifecycle
- **Persistence:** `draft.md` preserves state across sessions — pause and resume anytime
- **Finalization:** `--finalize` runs a 5-point PRD quality gate before generating `prd.md`

Discovery is also the **continuous entry point** for capturing ideas. Run it anytime you have a thought — the draft sits in `~/.claude/discoveries/` until you're ready to pick it up. The filesystem is your backlog.

The resulting PRD is the most important artifact in the cycle. `## Out-of-scope` is sacred — violations in `/review` result in a Blocked verdict.

### `/planning [repo/feature]`

Transforms a finalized PRD into a plan executable by subagents.

- **3-8 deliverables**, each with a complete, self-contained prompt for a Sonnet subagent
- **Dependency graph** with parallel batches and human gates
- **Walking skeleton** as D1 (existing projects) or setup as D1 (new projects)
- **Infrastructure checklist:** secrets, CI/CD, dependencies, migrations

Each deliverable specifies: model, isolation (worktree/none), dependencies, files touched, and a prompt with Context / What to do / What NOT to do / Validation.

### `/delivery [repo/feature]`

Orchestrator that executes the plan by launching subagents in parallel.

- **Baseline validation** before starting (build + tests = hard gate)
- **Batch execution:** all deliverables in a batch launch in parallel
- **Retry:** up to 2x per deliverable with error context
- **Human gates** at points defined by the plan
- **Prompt enrichment** with runtime context (current code state, results from previous batches)

### `/review [repo/feature]`

Read-only validation of code against the PRD.

- **Classification of each change:** Aligned / Drift / Extra-scope / Pending / Out-of-scope
- **Success criteria check** against the PRD
- **Code simplification** via subagent on modified files
- **Verdict:** Approved → `/ship` / Adjustments needed → fix list / Blocked → stop

### `/ship [repo/feature]`

Puts code in production and closes the cycle.

- **Build + test (hard gate)** — never creates a PR with a broken build
- **Smart path:** Fast (< 150 lines, no hot files) or Standard (waits for CI)
- **Deploy + smoke test** using `project.md` config
- **4 parallel subagents** generate: HANDOVER.md, CHANGELOG.md, LEARNINGS.md, pitfalls in CLAUDE.md
- **Cleanup:** archives discovery to `archived/`, removes worktree

## Artifacts

All artifacts live outside the target repo, in `~/.claude/discoveries/<repo>/<feature>/`:

| Artifact | Created by | Consumed by |
|----------|-----------|---------------|
| `draft.md` | `/discovery` | `/discovery` (resume) |
| `prd.md` | `/discovery --finalize` | `/planning`, `/review`, `/ship` |
| `plan.md` | `/planning` | `/delivery`, `/review`, `/ship` |
| `cycles/` | `/discovery` | human review |

Post-ship, four files are written to the target repo: HANDOVER.md, CHANGELOG.md, LEARNINGS.md, CLAUDE.md.
Completed features are archived to `~/.claude/discoveries/<repo>/archived/`.

### State as file presence

No database, no flags. Feature state is determined by which files exist:

| Files present | State |
|---------------|-------|
| `draft.md` | Discovery in progress |
| `prd.md` | Ready for planning |
| `prd.md` + `plan.md` | Ready for delivery |
| Code implemented | Ready for review |
| `archived/` | Done |

## Design principles

1. **One command, one transition.** No command does two things. `/discovery` doesn't plan. `/planning` doesn't implement.

2. **Artifact on disk is the only contract.** After `/clear`, the only context that exists is what was written to a file. Commands are designed assuming zero ephemeral context.

3. **`/clear` between commands.** Long sessions degrade response quality. Clean context = full capacity for the next stage.

4. **PRD is the contract.** `/review` validates against the PRD, not developer intuition. `## Out-of-scope` is a hard check — violation = Blocked.

5. **Skips are explicit.** You can enter the cycle at any point, but if a stage is skipped, the command flags the assumptions it's making.

6. **Push-back at gates.** The process creates friction where squad members would. `/discovery` questions assumptions. `/review` blocks drift. The system finds the human, not the other way around.

### Agnostic by design

The cycle doesn't distinguish between a new project and a feature within an existing project. `/discovery` doesn't know — and doesn't need to know — if the result will become a new repo or a branch. The same flow works for both, because the problem it solves (idea → validated code in production) is the same.

## Model discipline

| Role | Model | Rationale |
|------|-------|-----------|
| Main thread | Opus | Architectural decisions, orchestration |
| Subagents (implementation, docs) | Sonnet | Code execution, writing |
| Trivial tasks | Haiku | Formatting, listing |

Opus is never used as a subagent without explicit justification. The most expensive model orchestrates; the cheapest executes.

## Orchestration patterns

The plugin's multi-agent design is aligned with Anthropic's "Building Effective Agents" guidance and Andrew Ng's agentic design patterns. Six patterns are in play:

1. **Orchestrator-Workers.** Opus orchestrates; Sonnet/Haiku execute. The most expensive model makes architectural decisions and schedules work. The cheapest models do the work. Cost scales with task complexity, not session length.

2. **Fan-out/Fan-in.** `/delivery` groups deliverables into parallel batches based on their dependency graph. All deliverables in a batch launch simultaneously; the orchestrator waits for all to complete before releasing the next batch.

3. **Self-contained prompts.** Each deliverable is a complete, hermetic prompt — context, constraints, validation criteria, and anti-goals all included. No shared state between subagents, no session context to leak. This is what makes parallelism and retry safe.

4. **Human gates.** Phase transitions are structured pauses, not just handoffs. `/discovery → /planning`, `/planning → /delivery`, and `/review → /ship` all require explicit human judgment. The system finds the human; the human doesn't poll the system.

5. **Evaluator-Optimizer.** `/review` runs the reflection pattern: a Sonnet subagent critiques each change against the PRD, then the Opus orchestrator aggregates the verdicts and decides. The agent that produces is not the agent that evaluates.

6. **Retry with context.** Failed deliverables are retried up to twice. Each retry appends the error output and failure context to the original prompt. No silent failures, no infinite loops.

## Repo structure

```
.
├── README.md
├── .claude/
│   └── project.md
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── commands/
│   ├── discovery.md
│   ├── planning.md
│   ├── delivery.md
│   ├── review.md
│   └── ship.md
├── templates/
│   ├── prd-template.md
│   ├── plan-template.md
│   └── schemas.md
└── docs/
    ├── contracts.md
    ├── research.md
    └── thesis.md
```

## Installation

Add to `~/.claude/settings.json`:

```json
{
  "projects": {
    "/path/to/any/repo": {
      "plugins": [
        "/path/to/launchpad"
      ]
    }
  }
}
```

## Ecosystem

This plugin follows the 5 Laws of Skill Contracts:

- **Law 1** — Artifact is the only durable contract (state on disk, not in memory)
- **Law 2** — Artifacts have levels (discovery ≠ planning ≠ execution)
- **Law 3** — `## Handoff` is the contract between skills (each artifact has a handoff block)
- **Law 4** — Skips have explicit cost (skipping stages is allowed, but flagged)
- **Law 5** — `/clear` is hygiene (clean sessions between stages)
