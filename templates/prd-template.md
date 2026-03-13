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

Each requirement is the contract this feature must fulfill. Format: **R<N>:** verb + object + threshold. No quality adjectives — if you remove all adjectives the sentence must still have meaning.

- **R1:** <e.g. "User completes profile setup in ≤ 3 steps without leaving the page">
- **R2:** <e.g. "Endpoint returns 200 in < 300ms at p95 under 100 concurrent requests">

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

## Technical context

Enough for an agent to start implementing without researching the codebase from scratch.

- **Stack:** <languages, frameworks, runtime versions relevant to this feature>
- **Patterns:** <existing patterns the feature must follow — e.g. "all DB access through repository layer in src/db/">
- **Constraints:** <what the agent must not violate — e.g. "no new dependencies without approval">
- **Entry points:** <where in the codebase the feature connects — files, modules, API routes>

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
