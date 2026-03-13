# The Thesis

The thinking behind launchpad — why it exists, what it believes,
and the insights that shaped its design.

This is the source of truth for the project's intellectual foundation.
The README is the storefront. The contracts are the spec. This is the reasoning.

---

## The core problem

### Tools built for the wrong world

Linear, Jira, GitHub Projects, sprints, boards, PRDs, code reviews, standups — all of
project management as we know it was designed as **coordination protocols between humans**.

Assignees exist because multiple people need to know who's doing what. Story points exist
because humans are bad at estimating and teams need rough alignment. Sprint planning exists
because you need to negotiate priorities across people with different contexts. Code review
exists because one human's blind spots need another human's eyes.

A solo founder with a squad of agents doesn't have any of these problems. There's no
assignment ambiguity, no estimation negotiation, no cross-context alignment needed.

**The problem they have is entirely different: where to put attention right now.**

### The new bottleneck

Claude Code eliminated the build bottleneck for the solo dev. One person with agents can
implement in hours what used to take days. But a new bottleneck emerged: **human attention
and judgment**, spread thin across multiple projects and parallel features.

Without process, the agent invents features nobody asked for, ignores the ones that matter,
and loses context every session. The human spends more time course-correcting than they saved
on implementation.

---

## The paradigm shift

### From communication protocol to attention protocol

In the old model, process = communication protocol between humans. Meetings, tickets,
standups, retrospectives — all infrastructure for transmitting intent between brains.

In the new model, process = **attention protocol for one person**. The question isn't
"how do we align the team?" but "where should I look right now, and what decision does
this moment require?"

Every command in launchpad is designed around this: focus the human on the gate
that matters, delegate everything else to agents.

### The squad, compressed

What used to require 5-8 people now maps to one person + agents:

| Old role | New equivalent |
|----------|---------------|
| PM (prioritization, scoping) | Human — this is where judgment lives |
| Designer (UX, push-back on feasibility) | `/discovery` mockup cycles + `/review` push-back |
| Tech lead (decomposition, architecture) | `/planning` + human validation |
| Developers (implementation) | `/delivery` subagents |
| QA (verification against spec) | `/review` validating against PRD |
| Tech writer (docs, handover) | `/ship` doc subagents |

The human absorbs all *decision* roles (PM + design lead + tech lead).
Agents absorb all *execution* roles (dev + QA + docs).

### What doesn't change

Git isn't going anywhere — it was built for version control, not human coordination, so it
still serves. But the **workflow around git** changes:

- **Branch** = execution isolation for an agent, not "someone's feature"
- **PR** = checkpoint for human validation, not a review request
- **CI** = automated gate replacing the reviewer's eye for mechanical checks
- **Code review** = `/review` comparing against PRD, not a human reading diffs line by line

---

## Key insights

### 1. The PRD is where humans add the most leverage

In traditional teams, a 70% good PRD worked. Humans on the other side would interpret the
gaps, push back on ambiguity, fill in what was left unsaid. The senior dev would read
"implement search" and make 50 micro-decisions about edge cases, UX, and architecture.

Agents don't do this. **The PRD needs to be 95% good because the agent executes literally
what's written.** Out-of-scope becomes a hard constraint, not a suggestion. Success criteria
become a verifiable checklist, not an aspiration.

This means the human's highest-leverage activity shifted. It's no longer "managing people"
or "unblocking the team." It's **writing a PRD so precise that agents can execute it without
ambiguity.**

The implication for tooling: `/discovery` isn't bureaucracy — it's the most important command
in the entire cycle. The better the PRD, the better everything downstream works.

### 2. Discovery is a risk reduction engine

Discovery deals with risks of fundamentally different natures:

**Communication risks** (happen during the conversation itself):
- Human doesn't know what they want → extraction via Socratic questioning
- Human knows but can't articulate → translation, proposing interpretations
- LLM misunderstood the intent → validation loops, "does this capture it?"

**Initiative risks** (become explicit investigation cycles):
- The idea might be bad → kill conditions, competitive research
- Technical feasibility → spikes, proof of concepts
- Usability → mockups, prototype testing
- Business viability → market research, analysis

The key insight: communication risks should be handled **organically through good
conversation**, not as procedural steps. Initiative risks should be handled as **explicit,
documented cycles** that reduce uncertainty before committing code.

### 3. Push-back must be designed into the process

In a human squad, push-back happens naturally. The dev says "this is underspecified."
The designer says "this doesn't make sense for the user." The QA says "you forgot this
edge case."

Agents don't push back. They execute.

The launchpad process creates **artificial friction points** where a squad would
have had natural ones:

- `/discovery` pushes back against vague assumptions (the co-founder who questions)
- `/review` pushes back against code that deviates from PRD (the PM who holds the line)
- `/planning` pushes back against non-decomposable scope (the tech lead who says "too big")

Related insight from the one-man-squad-os pivot plan: the solution to "I lose track" isn't
"navigate better" — it's **"the system finds you."** Push-first, not pull-first.

### 4. Process is the product

For a solo dev with a squad of agents, what's missing isn't more build capacity. What's
missing is a process that **distributes work to agents and concentrates the human on the
gates that matter** — validation, scope, and design decisions.

The process itself is the competitive advantage. Not the agents (everyone has access to
the same models). Not the code (agents write that). The process that connects human judgment
to agent execution in the right places.

### 5. Features are initiatives, not tasks

A task has a known outcome. An initiative has a hypothesis. The difference matters because it
changes how you treat failure:

- Task fails → something went wrong, fix it
- Initiative fails → hypothesis was wrong, learn and move on

`/discovery` exists to kill bad initiatives early, not to document decisions already made. Each
investigation cycle reduces risk before committing code. The kill condition in the PRD isn't
a formality — it's the most honest line in the document.

### 6. The minimum testable unit of value

Planning decomposes work into deliverables. But the unit of decomposition matters.

Not "minimum viable" (implies cutting corners). Not "atomic task" (implies granularity
for its own sake). **Minimum testable unit of value**: after this deliverable, something
works and can be verified. The walking skeleton as D1 embodies this — end-to-end
integration before polish.

This also drives parallelization strategy: independent testable units can run in parallel
on cheaper models. The more testable each slice is, the more confidently you can parallelize.

### 7. State as file presence

No database, no flags, no state management. The state of a feature is determined by which
files exist on disk:

- `draft.md` exists → discovery in progress
- `prd.md` exists → ready for planning
- `plan.md` exists → ready for delivery
- code on branch → ready for review
- `archived/` → done

This is deliberately simple. It means any agent, in any session, can determine the current
state of any feature with a single `ls`. No API calls, no parsing, no context needed.

### 8. `/clear` is hygiene, not overhead

Long sessions degrade response quality. Context accumulates, attention diffuses, the model
starts hedging and repeating itself. Each command in the cycle is designed to work with
**zero ephemeral context** — everything it needs is on disk.

`/clear` between commands isn't a limitation — it's a feature. Clean context = full model
capacity for the next stage. The artifact on disk is the only contract.

---

## The old world vs. the new world

| Old world (PM + squad) | New world (solo + agents) | In the plugin |
|---|---|---|
| Linear ticket | Self-contained prompt with context | `plan.md` deliverables |
| Sprint planning | Portfolio of initiatives | `~/.claude/discoveries/` with file-based state |
| Peer code review | Validation against contract | `/review` diffs against PRD |
| Daily standup | Deterministic state | File presence = feature state |
| PRD to align stakeholders | PRD as execution spec | `/discovery` with iterative cycles |
| Retrospective | Automated learnings | `/ship` generates LEARNINGS.md |
| "Hey, pick up this task" | Agent with self-contained prompt | `/delivery` launches parallel subagents |
| Designer pushes back | Gates push back | `/review` blocks out-of-scope violations |
| QA tests against spec | Agent validates against PRD | `/review` success criteria check |
| Tech writer documents | Agent generates docs | `/ship` parallel doc subagents |

---

## Git in the agentic era

### What git solves and what it doesn't

Git does three things: **snapshots** (save state, roll back, compare versions),
**isolation** (work in parallel without stepping on each other), and **reconciliation**
(merge parallel work back together).

Snapshots are timeless — they serve any paradigm. The problem is with isolation and
reconciliation.

### Where git was designed for humans

**Branches as coordination unit.** One branch = one person working on one feature. Makes
sense when each human owns a feature. In the agentic world, one feature has 5 parallel
deliverables. Five branches? Five worktrees? The concept of "branch per person" doesn't
map to "deliverable per agent."

**Merge as negotiation.** When two humans edit the same file, git creates a conflict and
waits for someone with context to resolve it. Humans negotiate: "I'll change my part, you
change yours." Agents don't negotiate — each executed its prompt without knowing what the
other did. The orchestrator has context but didn't write the code. It's resolving a
conflict between two parties that never communicated.

**PRs as review ceremony.** PRs assume a human reviewing another human's work. In our model,
`/review` already validated against the PRD. The PR becomes bureaucracy — it exists to trigger
CI and provide a rollback point, not for actual review.

**Commits as human narrative.** "feat: add auth middleware" makes sense for humans reading
history. For agents, what matters is "deliverable D1 complete, files changed: X, Y, Z" —
the structured result, not the commit message.

### What agent-native version control would look like

If someone designed version control for multi-agent execution from scratch:

**File-level ownership at planning time.** The plan assigns files to deliverables. Two
parallel deliverables never touch the same file. Conflicts are prevented by design in
planning, not resolved after the fact in merge.

**Atomic patch sets instead of branches.** Each deliverable produces a patch set that
either applies cleanly or fails. No branch, no merge ceremony. If it conflicts, it's a
planning error — go back to the plan.

**Semantic diffs instead of line diffs.** Not "line 42 changed" but "function
`authenticate()` added to module `auth`." Agents think in terms of structure, not lines.

**Rollback per deliverable.** Undo D3 without undoing D1, D2, D4. Possible with git today
but painful (reverting specific commits with dependencies).

### The practical insight

**Good planning eliminates most of git's coordination problems.** If the plan correctly
assigns non-overlapping file ownership to each deliverable, there are no merge conflicts.
Git becomes just a snapshot/rollback mechanism — which is the part that works fine.

The problem is that not all overlap is avoidable. Shared files exist: types, config,
router, schema. And that's where git's merge model breaks down for agents.

What we do today (without inventing new version control):

1. **Planning assigns file ownership explicitly** — the "Files touched" field in each
   deliverable
2. **Planning detects overlap and makes it sequential** — if two deliverables touch the
   same files, they can't be parallel
3. **For shared files, the plan defines the contract** — when two deliverables need the
   same file, the plan specifies the expected interface and one deliverable is the owner,
   the other consumes
4. **Worktree as workaround** — works but is git compensating for a limitation that good
   planning should prevent

The bottom line: **git isn't outdated as a snapshot technology. It's outdated as a
coordination workflow.** And our planning skill is essentially replacing git's coordination
layer — the plan is the new branch strategy.

---

## Historical context: where this sits in the discourse

launchpad didn't emerge in a vacuum. The field moved through a clear arc in 2025:

**Vibe Coding (Feb 2025)** → Karpathy coined it. Accept all diffs, copy errors back. Works
for throwaway weekend projects. Became a meme and a movement.

**The Backlash (mid 2025)** → 45% of AI code has security vulnerabilities. 63% of devs spend
more time debugging AI code than it would've taken to write it. The "sustained negotiation
loop" problem: each iteration overrides earlier decisions.

**Spec-Driven Development (late 2025)** → GitHub Spec Kit, Google Conductor, Amazon Kiro.
Structured artifacts on disk as source of truth. Karpathy evolved to "agentic engineering."

**launchpad sits at the frontier of Phase 3** — but goes further than existing SDD tools
by treating the *entire lifecycle* as a gate-based process, not just the spec → code transition.
The insight that nobody else has articulated cleanly: **process is an attention protocol, not a
communication protocol.** SDD tools solve "how to write specs for agents." We solve "how to
manage a portfolio of initiatives across multiple projects when you're the only human."

### The gap we fill

Existing tools (as of March 2025):
- **GitHub Spec Kit** — spec → code, but no lifecycle, no review, no ship
- **Spec-Flow** — quality gates for Claude Code, closest analog, worth tracking
- **Factory AI** — connects Linear tickets to agents (still ticket-paradigm)
- **Google Conductor** — Markdown persistence, no process framework

What nobody has built:
> A lightweight, filesystem-native process framework that treats phases as gates, PRDs as
> execution contracts, and the human's job as approving phase transitions — without requiring
> any external SaaS or ticket system.

### The "Agentic Waterfall" counterpoint

Notable HN argument: autonomous AI agents force regression from Agile to Waterfall — either
unreviewed vibe code (fragile) or reviewed-after-the-fact code (Waterfall's original failure).
The claim: sync pair-programming with AI is structurally faster than async agents.

Our response: launchpad is neither Agile nor Waterfall. It's a **gate-based flow**
where the human reviews at phase transitions, not at every line. The gates are designed to
catch exactly the problems that both Agile (too little structure) and Waterfall (too late
feedback) fail at.

---

## Design decisions informed by research

The March 2025 deep research produced six concrete design choices. Each one connects a specific insight from the field to an implementation decision in the plugin.

### Verifiable slice as the unit of planning

Anthropic's guidance on agentic work identifies **verifiability** as the key criterion for what agents can safely execute autonomously. If the output of a task can't be checked programmatically, the human has no reliable way to confirm the agent did the right thing.

This drove a direct requirement: every deliverable in `plan.md` must include an automatable acceptance criterion — a command that can be run to verify completion. It also drove the adoption of a structured DAG format that makes dependencies and validation steps explicit and machine-readable.

The terminology took iteration. Candidates considered: *thin slice* (ambiguous — implies "cut down"), *walking skeleton* (captures end-to-end integration but not verifiability), *tracer bullet* (too military, implies exploratory rather than planned), *atomic story* (INVEST framing, but "story" is user-centric, not agent-centric). We landed on **verifiable slice** — anchored in Anthropic's insight, self-explanatory without prior context.

### Evaluator-Optimizer pattern in /review

Andrew Ng's "reflection" agentic pattern separates the generator from the evaluator: a second agent critiques the first agent's output independently, without shared context. This prevents the evaluator from rationalizing what the generator already produced.

`/review` implements this directly: it spawns a dedicated read-only subagent whose sole job is to critique the implementation against the PRD. The evaluator has no knowledge of the implementation decisions made during delivery. The orchestrator — not the evaluator — then decides what to do: retry a deliverable, escalate to the human, or approve and move to ship.

This replaced the previous "checklist + simplify" approach, which had the orchestrator evaluate its own output — structurally incapable of catching its own blind spots.

### Structured results over narrative

Subagents return structured markdown blocks with explicit fields: `task_id`, `status`, `files_changed`, `errors`. Not a prose summary. Not a diff. A predictable structure the orchestrator can parse and act on programmatically.

The motivation is twofold. First, it keeps the orchestrator's context lean — a structured 10-line result consumes far less context than a narrative explanation of the same outcome. Second, it enables programmatic decision-making: the orchestrator can branch on `status: failed` without reading prose.

This is derived from Anthropic's guidance on context isolation in multi-agent systems: the orchestrator shouldn't need to re-derive state from a subagent's narrative — it should receive the state directly.

### DAG-first planning

`plan.md` includes a machine-readable execution DAG alongside the human-readable deliverable descriptions. The DAG makes dependencies explicit: which deliverables can run in parallel, which must wait, which are blockers.

`/delivery` parses this DAG to determine batch scheduling. Without it, the orchestrator would have to re-derive dependencies from the deliverable descriptions at runtime — fragile, expensive, and prone to re-deriving them differently across sessions.

This aligns with LangGraph's graph execution model and CrewAI's DAG-based task orchestration patterns, both of which emerged in the same research period and validated the approach. The difference is that our DAG lives in a human-editable markdown file, not code.

### PRD quality gate at finalization

`/discovery --finalize` runs a structured quality checklist before generating `prd.md`. It won't produce a PRD that fails the checklist. This is a hard gate, not a warning.

The reasoning: PRD quality is the highest-leverage variable in the entire cycle. A weak PRD produces weak delivery regardless of how good the execution agents are. The field's convergence on spec-driven development — GitHub Spec Kit, Amazon Kiro, Google Conductor — validated this empirically. Every serious SDD tool from 2025 treats the spec as the quality gate, not an input to be cleaned up later.

The checklist operationalizes what "good PRD for agents" means: falsifiable problem statement, concrete success criteria, specific out-of-scope declarations, pre-made design decisions, and enough technical context that the agent doesn't have to guess at the environment.

### Worktree isolation as default for parallel execution

When two or more deliverables run in parallel against the same repository, they share a filesystem. Concurrent writes to the same files produce conflicts that are invisible at the agent level but corrupting at the repo level.

Claude Code's `isolation: worktree` creates a temporary git worktree per subagent — a separate checkout on a separate branch. Each subagent writes in isolation. The orchestrator merges results after each batch completes.

Worktree isolation is the **safe default** for parallel delivery. Sequential tasks don't need it. But any time `/delivery` schedules two deliverables in the same batch, worktree isolation is on. The cost (a few seconds of worktree setup) is trivially lower than the cost of a corrupted working tree.

---

## Open questions

Things we believe but haven't fully validated yet:

1. **Does the PRD quality checklist actually improve downstream outcomes?**
   We defined what a "good PRD for agents" looks like (falsifiable problem, concrete criteria,
   specific out-of-scope, pre-made design decisions, technical context). Does enforcing this
   at `--finalize` time measurably reduce rework in delivery?

2. **Is review the right place for the planning feedback loop?**
   Currently review can send you back to planning. But by then you've already spent tokens on
   delivery. Should planning itself have a lighter "pre-flight" validation?

3. **How much of ship should live in the plugin vs. the project?**
   The Makefile abstraction (ship-pr, ship-deploy, ship-docs, ship-cleanup) makes ship
   lighter and projects more customizable. But it also means every project needs to set up
   those targets. What's the right default?

4. **Does the cycle work for non-code deliverables?**
   The current design assumes the output is code in a repo. But the same attention management
   problem exists for content, design systems, data pipelines. How far does the abstraction
   stretch?

5. **Multi-project portfolio view.**
   launchpad manages features within projects. But the solo founder's real problem is
   managing *across* projects. The one-man-squad-os pivot plan explores this with the "portfolio
   of bets" model. How do these two systems connect?
