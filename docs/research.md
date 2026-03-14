# Research — March 2025

Deep research conducted across three domains to inform the design of launchpad.
This document is a source for articles, design decisions, and thesis refinement.

---

## 1. Minimum Testable Unit of Value — Terminology and Frameworks

### Existing terms

| Concept | Origin | Emphasis | Testability explicit? |
|---|---|---|---|
| Tracer Bullet | Hunt & Thomas, 1999 | End-to-end feedback loop | Implicit |
| Walking Skeleton | Cockburn, ~2000 | Architectural bootstrap (one-time) | Yes (CI from day 1) |
| Steel Thread | Unclear, early 2000s | Load-bearing first slice | Implicit |
| Vertical Slice | Bogard, 2018 | Feature cohesion, parallelism | Implicit |
| Thin Slice | No single author | Scope narrowness | Implicit |
| Atomic Story / INVEST | Bill Wake, 2003 | Story quality, independence | **Yes — defining criterion** |

### In the agentic world (2024-2025)

- **aihero.dev** adapted "tracer bullets" for LLMs — context window as forcing function for scope
- **Kiro (Amazon) + GitHub Spec-Kit** converge on specs → tasks where each task is the atomic agent unit
- **Anthropic ("Building Effective Agents")** identifies **verifiability** as the key criterion for agentic work
- **Martin Fowler** noted the granularity problem — Kiro over-decomposes trivial bugs into 16 acceptance criteria
- **No canonical term exists yet** for this concept in the agentic context

### Candidate terms

- **"Verifiable slice"** — self-explanatory, anchored in Anthropic's verifiability insight
- **"Tracer slice"** — carries both lineages (tracer bullet + thin slice), term not yet occupied
- **"Minimum testable unit of value"** — descriptive, emphasizes all three properties (minimum + testable + value)

### Key sources

- Hunt & Thomas, *The Pragmatic Programmer* (1999)
- Alistair Cockburn, *Writing Effective Use Cases* (2000)
- Bill Wake, INVEST criteria (2003)
- [aihero.dev — Tracer Bullets: Keeping AI Slop Under Control](https://www.aihero.dev/tracer-bullets)
- [Martin Fowler — Understanding SDD Tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Jade Rubick — Steel Threads](https://www.rubick.com/steel-threads/)
- [Jimmy Bogard — Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)

---

## 2. The Discourse Arc: Vibe Coding → Context Engineering → Spec-Driven Development

### Phase 1 — Vibe Coding (Feb 2025)

Andrej Karpathy coined the term: "accept all diffs without reading them, copy error messages
back until things work." Honest caveat: "not too bad for throwaway weekend projects."

### Phase 2 — The Backlash (mid 2025)

- Veracode: 45% of AI-generated code introduces security vulnerabilities
- CodeRabbit: AI co-authored PRs have 2.74x more security vulnerabilities
- 63% of developers report spending more time debugging AI code than writing it themselves
- MIT Tech Review: the human ends up in a "sustained negotiation loop, repeatedly restating intent"

### Phase 3 — Spec-Driven Development (late 2025)

The field converged:
- **GitHub Spec Kit** — open-source toolkit: PRD → architecture → tasks → implementation
- **Google Conductor** — Markdown files in repo that persist state across sessions
- **Amazon Kiro** — IDE with built-in spec → task decomposition
- **Karpathy evolved** to "agentic engineering": "you are not writing the code 99% of the time,
  you are orchestrating agents who do and acting as oversight"

### Validation of our thesis

- **Lazar Jovanovic (Lovable, Lenny's Podcast, Feb 2026):** "The PRD and Markdown file system
  that keeps AI agents aligned across complex builds" — recommends kicking off 4-5 parallel
  prototypes to clarify thinking before committing
- **HN "30k-line codebase solo with 4 AIs":** core problem at scale = "subtle architectural drift"
- **"Codified Context" (arXiv, early 2026):** 60,000+ GitHub repos now include agent instruction files
- **Advanced Context Engineering (HumanLayer/GitHub):** formalizing "drift detection" — sending changes
  plus project spec to an LLM for alignment scoring

### What nobody has built (our gap)

> "A lightweight, filesystem-native process framework that treats phases as gates, PRDs as
> execution contracts, and the human's job as approving phase transitions — without requiring
> any external SaaS or ticket system."

Closest competitors:
- **Spec-Flow** (marcusgoll) — quality gates + auditable artifacts for Claude Code
- **Factory AI** — connects Linear/Jira to agents (still ticket-driven)
- **Google Conductor** — Markdown files in repo (similar artifact model, no process framework)

### Vibe Coding vs. Launchpad

| Dimension | Vibe Coding | Launchpad |
|---|---|---|
| Planning | Implicit, emergent | PRD as execution contract |
| Execution | Continuous prompting loop | Discrete phases with gates |
| Human role | Reactive (fix what breaks) | Directive (approve transitions) |
| Failure mode | Context drift, negotiation loops | Gate fails → human intervenes at the right moment |
| Coordination unit | The prompt | The artifact |

### Documented failure modes in the field

1. **Context drift** — each iteration overwrites earlier constraints
2. **Spec-less execution** — ambiguity resolved by AI defaults, not founder intent
3. **Invisible technical debt** — 2.4x more abstraction layers than necessary
4. **Token waste** — expensive models on cheap tasks, no checkpoints
5. **Attention fragmentation** — multiple agents without human review cadence

### Key sources

- [Karpathy, vibe coding (X, Feb 2025)](https://x.com/karpathy/status/1886192184808149383)
- [From Vibe Coding to Context Engineering (MIT Tech Review)](https://www.technologyreview.com/2025/11/05/1127477/from-vibe-coding-to-context-engineering-2025-in-software-development/)
- [Beyond Vibe Coding: The Case for SDD (The New Stack)](https://thenewstack.io/vibe-coding-spec-driven/)
- [Karpathy on "agentic engineering" (The New Stack)](https://thenewstack.io/vibe-coding-is-passe/)
- [GitHub Spec Kit (GitHub Blog)](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- [The Agentic Waterfall (HN)](https://news.ycombinator.com/item?id=46960638)
- [30k-line codebase solo with 4 AIs (HN)](https://news.ycombinator.com/item?id=46462910)
- [Lazar Jovanovic on Lenny's Podcast](https://www.lennysnewsletter.com/p/getting-paid-to-vibe-code)
- [Spec-Flow (GitHub)](https://github.com/marcusgoll/Spec-Flow)
- [Advanced Context Engineering (HumanLayer)](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md)

---

## 3. Multi-Agent Orchestration Patterns

### Patterns we already use (validated)

| Pattern | Where we use it | Alignment |
|---|---|---|
| Orchestrator-Workers | `/delivery` (Opus → Sonnet/Haiku) | Anthropic guidance |
| Fan-out/Fan-in | `/delivery` batch execution | Anthropic, LangGraph |
| Self-contained prompts | `/planning` deliverable templates | Anthropic, OpenAI "routines" |
| Human gates | Between phases | LangGraph interrupt/resume |
| Retry with error context | `/delivery` (2x max) | Anthropic recommends 2-3x |
| Model tiering | Haiku/Sonnet/Opus | Anthropic explicit guidance |

### Patterns we should adopt

#### Evaluator-Optimizer Loop (Andrew Ng: "reflection")

One agent generates, a separate agent evaluates against criteria. "Surprising performance gains"
relative to implementation cost. For `/review`: spawn a dedicated review subagent (Sonnet, read-only)
whose sole job is structured critique against PRD acceptance criteria.

#### Structured results (not narrative)

Define a result schema: `{task_id, status, files_changed, summary, errors}`. Keeps orchestrator
context lean and enables programmatic evaluation. Current subagents return free text — fragile.

#### Skill injection at spawn time

Claude Code's `skills` field injects domain knowledge into the subagent's system prompt.
Eliminates tool calls for convention discovery. Include project-relevant skills in each executor.

#### Explicit DAG in plan.md

Plan should output a machine-readable DAG: `{id, depends_on, executor_tier, max_retries,
acceptance_criteria}`. Current format is human-readable but not parseable by `/delivery`.

#### Worktree isolation as default for parallel tasks

`isolation: worktree` prevents filesystem conflicts between parallel executors. Should be
the default when 2+ tasks run simultaneously on the same repo.

### Key architecture constraints (Claude Code)

- Subagents **cannot** spawn other subagents — only the main thread can spawn
- Subagent results return to main context (context grows with each result)
- Agent Teams have independent context windows (more expensive, main context stays lean)
- `skills` field content is injected, not just made available — must be listed explicitly
- Worktree is auto-cleaned if no changes made

### Implications for `/planning`

1. Output a DAG, not a list
2. Write self-contained prompt templates during planning (injected with current state at delivery)
3. Tag parallelism explicitly — mark which tasks can run concurrently
4. Define gates as design decisions during planning, not delivery afterthoughts

### Implications for `/delivery`

1. Dispatch in batch rounds — execute all DAG frontier tasks simultaneously
2. Use worktree isolation for parallel file-writing tasks
3. Require structured results from executors
4. Retry with context, cap at 2-3 attempts, then escalate to human gate
5. Inject skills at spawn time
6. Model tier decision at task dispatch (haiku: mechanical, sonnet: judgment)

### Key sources

- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Claude Code docs — Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code docs — Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [LangGraph — Multi-agent concepts](https://langchain-ai.github.io/langgraph/concepts/multi_agent/)
- [OpenAI Cookbook — Orchestrating Agents](https://developers.openai.com/cookbook/examples/orchestrating_agents)
- [Andrew Ng — Agentic Design Patterns](https://deeplearning.ai/the-batch)
- [Lilian Weng — LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/)
- [CrewAI Flows docs](https://docs.crewai.com/concepts/flows)

---

## 4. Solo Founder Landscape

### Market data

- Carta: 35% of U.S. startups incorporated in 2024 had a single founder (vs. 17% in 2017)
- Dario Amodei predicted "first one-employee billion-dollar company" by 2026
- 60,000+ GitHub repos include agent instruction files (CLAUDE.md, AGENTS.md, etc.)

### The "Agentic Waterfall" counterpoint

Notable HN argument: autonomous AI agents force regression from Agile to Waterfall — either
unreviewed vibe code (fragile) or reviewed-after-the-fact code (Waterfall's original failure).
The argument is that **sync pair-programming with AI is structurally faster** than async agents.

This actually supports our thesis: the answer isn't to reject structure, it's to design the
right gates. launchpad is neither Agile nor Waterfall — it's a gate-based flow where
the human reviews at phase transitions, not at every line.

### Common failure modes reported

1. Context drift / architectural amnesia
2. Spec-less execution (ambiguity resolved by AI defaults)
3. Invisible technical debt (2.4x abstraction layers)
4. Token waste / cost blowout
5. Attention fragmentation (multiple agents, no review cadence)

All five are directly addressed by launchpad's design.
