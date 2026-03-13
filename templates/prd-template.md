---
id: <slug>
project: <project-alias>
created: <date>
updated: <date>
tags: []
priority: medium
supersedes:
---
# PRD: <name>

## Problem
Who is affected, what hurts, why now.

Must be **falsifiable**: include a measurable current state (metric, user action, error rate,
frequency) that the solution will change. Not "users are frustrated" — state the concrete
condition that proves the problem exists.

## Requirements

Functional requirements — the contract this feature must fulfill, written for the stakeholder.
Each requirement describes an observable product behavior that a non-engineer can verify.
Format: **R<N>:** verb + object + threshold. No implementation details — if you need to
mention a technology, framework, or internal system name, it belongs in Technical Specs.

Coverage test: for each facet of the problem described above, at least one requirement must
address it. If a part of the problem has no requirement, the PRD has a gap.

- **R1:** <e.g. "User completes profile setup in ≤ 3 steps without leaving the page">
- **R2:** <e.g. "Invalid documents are rejected with a specific error before being saved">

## Solution
Explain how the solution addresses the requirements (reference by ID).

### Design decisions

All product/UX forks must be resolved here. No TBDs, no "could X or Y", no open questions.
Search for: "TBD", "to be decided", "could", "might", "option A/B" — each must be resolved.

- <decision 1 — e.g. "Authentication uses magic links only. OAuth is explicitly out of scope.">
- <decision 2 — e.g. "Error messages use the copy in docs/error-copy.md. Fallback: 'Something went wrong. Try again or contact support.'">

## Out-of-scope
What NOT to do — critical for the agent to not invent.

Each item must **name the specific thing excluded**, not just the category.
Not "mobile is out of scope" — say "iOS and Android native apps are out of scope.
The web app must be responsive down to 375px but native builds are not part of this feature."

- <item 1>
- <item 2>

## Technical Specs

Implementation guidance consumed by `/planning` to build deliverables. This is orientation,
not a contract — if the executor finds a better technical path and the functional requirements
still pass, the specs served their purpose. No formal IDs needed.

- **Stack:** <languages, frameworks, runtime versions relevant to this feature>
- **Patterns:** <existing patterns the feature must follow — e.g. "all DB access through repository layer in src/db/">
- **Constraints:** <what the agent must not violate — e.g. "no new dependencies without approval">
- **Entry points:** <where in the codebase the feature connects — files, modules, API routes>
- **Implementation notes:** <specific technical decisions, API designs, data models, integration details that guide the executor>

## Risks validated

| Risk | Type | Method | Decision | Artifact |
|---|---|---|---|---|
| <risk description> | UX / technical / business / distribution / integration | mockup / spike / research / interview / analysis | <what was decided> | cycles/<NN>-<type>-<desc>/ |

## Risks accepted
- <risk> — accepted because <reason>

## Investigation cycles

| # | Type | Description | Date |
|---|---|---|---|
| 01 | framing | <desc> | <date> |
