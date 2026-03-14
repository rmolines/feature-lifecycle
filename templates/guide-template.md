---
project: <project-name>
created: <date>
updated: <date>
---
# Guide: <interface-name>

> UX journey document for `<interface-name>`. Each layer is a different lens on the same interface — fill them in order, as later layers depend on earlier ones.

---

## Goals

_What the user is trying to accomplish. Written as JTBD outcome statements using minimize/maximize framing. Each goal must be specific enough to generate a design decision._

**Agent instructions:** Before filling this section, ask the user: "What jobs does someone come to this interface to do? What are they trying to avoid or achieve?" If unable to ask, read the product spec and derive goals from the described user problems.

**Format:** one bullet per goal, using `Minimize <friction>` or `Maximize <outcome>` phrasing.

**Example:**

- Minimize time-to-triage when the developer opens the dashboard in the morning to understand what needs action
- Maximize situational awareness of pipeline health across projects without switching to the terminal
- Minimize friction to resume work on a specific item (finding where it is, what stage, what the next step is)
- Minimize cognitive overhead when deciding what to work on next across multiple competing items

---

## Personas

_Who uses this interface, and how they think about it. Not demographics — mental model._

**Agent instructions:** Identify the primary user type and their internal model of the domain. Describe what they call things, how they navigate (job-driven vs. structure-driven), and where their mental model diverges from the interface's structure.

**Format:** one primary persona in structured prose, optional secondary personas as brief notes.

**Example:**

**Primary: Solo developer using an AI orchestrator**

This person runs 4-8 active projects simultaneously. They don't manually track state — agents do. When they open this interface they are doing a morning review or switching context mid-day. Their mental model is:

- Missions = projects — a stable set, rarely changing
- Modules = features in flight — constantly shifting status
- Status = where a module is in the lifecycle
- Artifacts = evidence that work happened

They think in terms of **what needs me** (attention-driven) and **what's happening** (pipeline view). They rarely think in terms of tabs — they have a job in mind and expect to accomplish it without learning the interface's internal structure first.

**Mental model gap:** The interface is organized around tabs, but the user's mental model is organized around jobs. This forces them to learn the interface's structure before they can work.

---

## Tasks

_What tasks users perform, broken down step by step. Uses Hierarchical Task Analysis (HTA) format. This is the most analytically valuable layer — walk every job to find where flows break._

**Agent instructions:** For each job from the Goals section, trace every step a user would take. Number steps hierarchically. After each job tree, write a `Breakdown:` paragraph describing gaps, dead ends, or missing affordances you found while tracing the steps. Cross-reference each job to its goal with a `goal:` label.

**Format:** one `### Job <letter> — <title>` per job, with a numbered HTA tree inside a code block, then a `**Breakdown:**` paragraph.

**Example:**

### Job A — Morning triage: "What needs me today?"

`goal:` Minimize time-to-triage

```
0. Understand what requires attention across all items
  1. Open the interface
  2. Check attention count in header
    2.1 Notice yellow "attention N" chip — or absence of it
  3. Navigate to Attention section
    3.1 Click "Attention" tab
    3.2 Scan table: project / action / type / context columns
    3.3 Read "Limbo" section for stuck items
  4. Decide what to act on
    4.1 No path to act from this view — must mentally note the item and navigate elsewhere
```

**Breakdown:** After step 3, there is no affordance to jump to the relevant item. The attention table gives project and action but no link or drill-down. The developer must hold the information in working memory and navigate manually. This is a dead end that breaks the most common morning job.

---

### Job B — Resume work on a specific item

`goal:` Minimize friction to resume work

```
0. Return to an item to continue or review its work
  1. Open the interface
  2. Find the item
    2.1 Option A: Overview → filter by project → scan cards
    2.2 Option B: Pipeline → find in the right status column
    2.3 No search available
  3. Open item detail
    3.1 Click card to expand (Overview only — Pipeline cards are not clickable)
    3.2 Read summary, artifact list, review decision
  4. Navigate to relevant artifact
    4.1 If plan exists: click "view plan →" link (only link present)
    4.2 Otherwise: no link — must go to terminal or find file manually
```

**Breakdown:** Only one artifact type has a link. Other artifacts are shown as present/absent but are not navigable. The user knows a file exists but cannot open it from here.

---

## Flows

_How states connect. Describes the interface as a state machine — what states exist, what triggers transitions, and what guards apply. Captures all loading, error, and empty states._

**Agent instructions:** Enumerate every distinct UI state. For each state, list the triggers that cause a transition and their targets. Use prose guards (not formal XState syntax) — e.g., `guard: "user has unsaved changes"`. Include error and empty states explicitly.

**Format:** YAML inside a code block. Each state has a `description:` and an `actions:` list with `trigger:` and `target:` fields. Guards go on the `trigger:` line as inline prose.

**Example:**

```yaml
states:

  page-loading:
    description: Page loads, skeleton shown, fetching data in parallel.
    actions:
      - trigger: data-loaded
        target: overview-idle
      - trigger: fetch-error
        target: error-state

  error-state:
    description: Error message shown. Other sections still accessible but empty.
    actions:
      - trigger: user clicks refresh
        target: page-loading

  overview-idle:
    description: Default landing state. Cards visible, filters available.
    actions:
      - trigger: click-filter
        target: overview-filtered
      - trigger: click-item-card
        target: item-card-expanded
      - trigger: click-detail-tab
        target: detail-empty

  item-card-expanded:
    description: Card expanded inline. Shows summary, artifact list, action links.
    actions:
      - trigger: click-card-again (toggle)
        target: overview-idle
      - trigger: click-view-detail
        guard: "detail artifact exists"
        target: detail-view (separate page)

  detail-empty:
    description: No item selected. Empty state message shown.
    actions:
      - trigger: select-item-from-dropdown
        target: detail-loading

  detail-loading:
    description: Loading indicator shown. Fetching item data.
    actions:
      - trigger: data-loaded
        target: detail-populated
      - trigger: fetch-error
        target: detail-empty

  detail-populated:
    description: Full detail view with sections and actions.
    actions:
      - trigger: select-different-item
        target: detail-loading
      - trigger: click-open-full-view
        target: full-view SPA (separate page)
```

---

## Screens

_What each screen or major view contains. Enumerates components, data it needs, actions it offers, and all the states it must handle (loading, empty, error, success)._

**Agent instructions:** For each distinct screen or tab, list its purpose, components, data sources, actions, and states. Components should be named (not described) — use names that match the design system if one exists. States must cover at minimum: loading, empty, error, and the normal populated state.

**Format:** YAML inside a code block. One top-level key per screen.

**Example:**

```yaml
header:
  purpose: Global status summary and primary navigation
  components:
    - wordmark with project subtitle
    - item count chip
    - attention count chip (conditional on count > 0)
    - status summary bar (dot + count + label per status)
    - tab bar with badge counts
  data:
    - total item count
    - attention item count
    - status counts map (status → count)
  actions:
    - click tab to switch active pane
  states:
    loading: chips show 0, status bar hidden
    loaded: all chips populated, status bar visible
    attention: yellow chip visible when attention count > 0

overview-tab:
  purpose: Browseable item grid with expandable cards and filtering
  components:
    - mission-cards-row (horizontal, one per project)
    - filter tab bar (all + one per project)
    - item-grid (CSS grid of cards)
    - skeleton-loader (loading state)
    - empty-state message
  data:
    - projects[] with alias, description, stage, progress, item counts
    - filteredItems[] with status, artifacts, summary, review decision, tags
  actions:
    - filter by project
    - click item card to expand (toggle)
    - click artifact link if present
  states:
    loading: skeleton cards shown
    empty: "no items found" message
    error: error message with description
    normal: project cards + item grid

detail-tab:
  purpose: Deep inspection of a specific item's structure and results
  components:
    - item-selector-bar with dropdown
    - open-full-view link (conditional)
    - requirements-panel
    - stats-row (counts and result summary)
    - batch sections with task cards
    - task-card with result badge, title, executor, deps, acceptance criteria (collapsible)
  data:
    - itemsWithDetail[] for dropdown options
    - itemData: tasks[], requirements[], results[]
  actions:
    - select item from dropdown
    - toggle acceptance criteria per task
    - open full view (exits to separate page)
  states:
    empty: no item selected
    loading: loading indicator shown
    populated: requirements + batches rendered
    error: reverts to empty state message
```

---

## Layout

_Visual arrangement of each screen. ASCII wireframes that commit to a spatial hierarchy. Interactive elements are annotated with `[→ target]` to link layout to navigation._

**Agent instructions:** Draw an ASCII wireframe for each major screen state. Mark every interactive element with `[→ target-state-or-screen]`. The wireframe should be detailed enough that a developer could derive a CSS grid or flexbox structure from it. Focus on hierarchy and proportion, not pixel perfection.

**Format:** one `### <Screen name>` heading per screen, with the ASCII art inside a code block.

**Example:**

### Header (always visible)

```
┌──────────────────────────────────────────────────────────────────────┐
│ myapp://              project-name  │ items 31 │ attention 2 [→ attention-tab] │
│ ● 5 seed  ● 3 in-progress  ● 2 done  ● 1 approved                   │
│ [Overview [→ overview-tab]] [Pipeline [→ pipeline-tab]] [Detail [→ detail-tab]] [Attention (2) [→ attention-tab]] │
└──────────────────────────────────────────────────────────────────────┘
```

### Overview tab

```
┌──────────────────────────────────────────────────────────────────────┐
│ PROJECTS                                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                              │
│ │ project-a│ │ project-b│ │ project-c│                              │
│ │ building │ │ active   │ │ planned  │                              │
│ │ ████░░░  │ │ ████████ │ │ ░░░░░░░  │                              │
│ │ 3m · 2f  │ │ 5m · 5f  │ │ 2m · 0f  │                              │
│ └──────────┘ └──────────┘ └──────────┘                              │
│                                                                      │
│ [all] [project-a] [project-b] [project-c]       all items · 31 total│
│                                                                      │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐            │
│ │ item-name      │ │ item-name      │ │ item-name      │            │
│ │ project · slug │ │ project · slug │ │ project · slug │            │
│ │ [draft][prd]   │ │ [draft][prd]   │ │ [draft][prd]   │            │
│ │ ● building     │ │ ● in-progress  │ │ ● done         │            │
│ └────────────────┘ └────────────────┘ └────────────────┘            │
│  [→ item-card-expanded]                                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Item card — expanded state

```
┌────────────────────────────────────────────────┐
│ item-name                          ● building  │
│ project · slug                            [^]  │
│ [draft] [prd] [plan] [·results] [·review]      │
│ ─────────────────────────────────────────────  │
│ Problem text (120 chars max)                   │
│ review: approved                               │
│ [tag-a] [tag-b]                                │
│ artifacts                                      │
│   ✓ draft   ✓ prd   ✓ plan   ✗ results         │
│ view plan → [→ plan-view-spa]                  │
└────────────────────────────────────────────────┘
```

---

## Navigation

_How screens connect. Two parts: (1) a site map of all reachable screens and their links, and (2) Desire Paths — the ideal journeys a user would take if the interface supported them._

**Agent instructions:** First, map every link that currently exists as a tree. Then write Desire Paths — list the 3-5 most common journeys a user wants to take as a sequence of states. Desire Paths often surface missing links: if the ideal path requires a transition that doesn't exist in the site map, that's a gap.

**Format:** the site map as a tree using `├──` and `└──`. Desire Paths as a numbered list of step sequences.

**Example:**

### Site Map

```
app:// (header always present)
│
├── [Overview tab] ──── default landing
│   ├── Project cards (read-only summary)
│   ├── Project filter tabs → filters item grid
│   └── Item cards (grid)
│       └── [click to expand] → inline detail
│           └── "view detail →" → /detail-view?p=&item= (separate page)
│
├── [Pipeline tab]
│   └── Kanban columns (read-only)
│
├── [Detail tab]
│   ├── Item dropdown selector
│   ├── Detail view (structure + task batches)
│   └── "open full view →" → /detail-view?p=&item= (separate page)
│
└── [Attention tab]
    ├── Needs Attention table (read-only, no links)
    └── Limbo chips (read-only)

External:
  /detail-view?p=&item= — full detail SPA (separate page, not a tab)
```

### Desire Paths

The ideal journeys a user would take. Sequences marked with `✗` are currently broken — the interface has no path between those states.

1. **Morning triage → act:** `page-loading → overview-idle → attention-tab → [item link] → item-card-expanded`
   ✗ Broken: attention-tab has no links to items

2. **Pipeline overview → inspect plan:** `overview-idle → pipeline-idle → [click pipeline card] → detail-tab (for same item)`
   ✗ Broken: pipeline cards are not clickable

3. **Find item → view artifact:** `overview-idle → item-card-expanded → [artifact link] → artifact view`
   ✗ Broken: only plan artifact has a link; other artifacts are not navigable

4. **Verify ready to ship → ship:** `pipeline-idle → [approved item] → item-card-expanded → [ship action]`
   ✗ Broken: no ship action exists anywhere in the interface

5. **Inspect plan → return to pipeline:** `detail-populated → [back link] → pipeline-idle (same item highlighted)`
   ✗ Broken: no back-links between tabs

---

## Missing States

_States that should exist in the interface but don't. A flat list derived from the Breakdown observations in the Tasks section and the Desire Paths gaps above._

**Agent instructions:** Review every Breakdown paragraph in the Tasks section and every broken Desire Path. Convert each gap into a missing state. Name states in kebab-case matching the Flows section vocabulary.

**Example:**

- `attention-item-link` — each row in the Attention table should link to the relevant item card or module
- `pipeline-card-clickable` — Pipeline cards should be clickable, expanding detail or navigating to the Detail tab for that item
- `artifact-links` — draft, prd, results, and review artifacts should be navigable links, not just presence indicators
- `stale-module-signal` — a visual indicator for items that have been in the same status for N+ days without activity
- `ship-action` — an affordance to trigger a ship action for items in "approved" status, without leaving the interface
- `cross-tab-routing` — clicking a reference to an item in one tab should navigate to that item in the target tab

---

## What to Fix

_Actionable requirements derived from the Breakdown and Missing States sections. Each item is a concrete change with a clear outcome._

**Agent instructions:** Convert each Missing State and Breakdown observation into a requirement statement. Format: `- **Fix <N>:** <verb> + <object> + <expected outcome>`. This section is the bridge from analysis to implementation.

**Example:**

- **Fix 1:** Add item links to every row in the Attention table so the user can navigate directly to the relevant item without leaving the tab
- **Fix 2:** Make Pipeline cards clickable — clicking a card should expand detail inline or switch to the Detail tab with that item pre-selected
- **Fix 3:** Make all artifact types (draft, prd, results, review) navigable links, not just presence indicators
- **Fix 4:** Add a "stale" visual signal to items in the Pipeline that have not changed status in 7+ days
- **Fix 5:** Add a "ship" action button to item cards when the item is in "approved" status
- **Fix 6:** Add cross-tab routing — when referencing an item in any tab, provide a link that navigates to that item in the most relevant tab

---

## References

_Pointers to external artifacts this guide depends on. The guide must be read alongside these to be actionable for implementation._

**Agent instructions:** List the design token file, API schema, and any other artifacts an implementer would need. Use absolute or repo-relative paths. Do not reproduce the content of these files here — just point to them.

**Example:**

- Design tokens: `design-system/tokens.md` (color, spacing, typography variables)
- API schema: `docs/api.md` or `src/api/` (response shapes for data listed in Screens)
- Component library: `design-system/blocks/` (existing blocks to compose from)
- Related PRD: `~/.claude/initiatives/<mission>/<module>/prd.md`
