# Changelog

## cockpit-v2: MCP server migration to 3-level paths — PR #15 — 2026-03-14
**Type:** feat
**PRD:** `~/.claude/initiatives/fl/cockpit-v2/prd.md`
**Commit:** `git show fda17c2`
**Decisions:** see LEARNINGS.md#cockpit-v2

Added `stage` parameter to all MCP tools (`init_create`, `init_list`, `init_get_status`, `init_update_fields`, `init_update_section`, `init_add_cycle`, `init_finalize`, `init_archive`, `init_validate`, `init_read_me`). Registered new doc types (`module`, `draft-module`) in SCHEMAS alongside legacy `prd`/`draft`. API layer now recognizes `module.md`/`draft-module.md` in addition to `prd.md`/`draft.md`. Added missing devDependencies.

## Session Isolation + Cockpit V2 — 2026-03-14
**Type:** feat
**PRD:** `~/.claude/initiatives/fl/session-isolation/prd.md`
**Commit:** `git show 536277d`

**Session Isolation:** Delivery agora cria `feat/<module>` branch antes de executar deliverables. Ship detecta feature branch automaticamente e cria PR com `--base` correto. Resolve o problema de commits intercalados quando múltiplas sessões rodam delivery no mesmo repo.

**Cockpit V2:** Hierarquia 3 níveis (mission/stage/module) no MCP server, API, views e skills. Migration script de estrutura flat para hierárquica. Views com drill-down hierárquico.

## UX Journeys — PR #14 — 2026-03-14
**Type:** feat
**PRD:** `~/.claude/initiatives/fl/ux-journeys/prd.md`
**Commit:** `git show 5b859bd`
**Decisions:** Paradigma de design thinking em 2 fases (guide → implementação). Template guide.md com 8 camadas UX. Integração com planning (detecção) e delivery (consumo).

## workspace-server-migration — PR #13 — 2026-03-13
**Type:** migration
**PRD:** ~/.claude/initiatives/fl/workspace-server-migration/draft.md

Migrated all HTML views from bash scripts (cockpit.sh, mission-view.sh, plan-view.sh)
to the workspace server (Bun HTTP/WS on port 3333). Unified domain naming
(mission/module/stage) across API, views, and commands. Aligned status derivation
between bash and TypeScript. Added new API endpoints (/api/missions, /api/plans,
/api/cockpit-manual). Built full cockpit (4 tabs), mission-view, and plan-view in
views/. All skills now open views via server URLs. Deleted legacy bash HTML scripts
and templates.

## worktree-commit-gap — PR #12 — 2026-03-13
**Type:** fix
**PRD:** ~/.claude/initiatives/fl/worktree-commit-gap/prd.md
**Commit:** `git show c59c1e8`
**Decisions:** see LEARNINGS.md#worktree-commit-gap

## workspace-server — PR #11 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/initiatives/fl/workspace-server/prd.md
**Commit:** `git show 9708523`
**What:** Unified Bun server extending initiatives-db MCP with HTTP/WS dual transport, REST API reusing domain logic, file-based view routing, filesystem watcher with WebSocket hot-reload, design system (tokens.css + components.js), and cockpit dashboard (Alpine.js + Tailwind CDN).

## QMD fallback pitfall — 7eed480 — 2026-03-13
**Type:** docs
**Commit:** `git show 7eed480`
**What:** CLAUDE.md pitfall documenting QMD fallback strategy for reading initiatives files. All skills now reference this pitfall instead of failing with 6+ QMD retries when files aren't indexed.

## domain-rename — 59b9b33 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/initiatives/fl/domain-rename/prd.md
**Commit:** `git show aec6c7d` (main), `git show 59b9b33` (cosmetic fixes)
**Decisions:** see LEARNINGS.md#domain-rename (if applicable)
**What:** Rename domain terminology across MCP params, cockpit JSON, schemas, skills, and templates:
- project → mission
- slug → module (MCP params)
- initiative → module (dir concept, cockpit JSON)
- vision.md → mission.md (file type)
- milestone (M1) → stage (S1) (sections, JSON keys)
- cockpit → Mission Control (UI label)

Physical paths unchanged.

## initiatives-db — PR #10 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/initiatives/fl/initiatives-db/prd.md
**Commit:** `git show 5575b97`
**Decisions:** see LEARNINGS.md#initiatives-db

## requirements-split — PR #9 — 2026-03-13
**Type:** improvement
**PRD:** ~/.claude/discoveries/fl/requirements-split/prd.md
**Commit:** `git show d93321f`
**What:** PRD template now separates functional requirements (stakeholder-verifiable, R<N> format) from technical specs (implementation guidance for planning). Quality gate validates requirements are functional and cover all problem facets. Planning consumes Technical Specs for deliverable prompts.

## GTM Skill — PR #8 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/gtm/prd.md
**Commit:** `git show 148239e`
**What:** New `/launchpad:gtm` command — quarterly playbook, weekly plans with retrospectives, daily briefs. Single command, filesystem-routed. Also includes `discoveries/` → `initiatives/` path migration across all skills.

## requirements-as-contract — PR #7 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/discoveries/launchpad/requirements-as-contract/prd.md
**Commit:** `git show 209f640`
**Decisions:** see LEARNINGS.md#requirements-as-contract

## portfolio-review — PR #6 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/portfolio-review/prd.md
**Commit:** `git show 2fc8480`
**Decisions:** see LEARNINGS.md#portfolio-review

New `/portfolio-review` skill with 5 phases: panorama, strategic map, conversation, execution, review log. Scans all discoveries, detects overlaps via QMD, applies taxonomy actions (matar, consolidar, promover, pausar, decompor), persists review log. Plugin version bumped to 0.7.0. ship.md updated with plugin version bump automation.

## Session Analyzer — PR #5 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/session-analyzer/prd.md
**Commit:** `git show dac0e7a`
**Decisions:** see LEARNINGS.md#session-analyzer

## cockpit-sync — PR #4 — 2026-03-13
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/cockpit-sync/prd.md
**Commit:** `git show b8d66df`
**Decisions:** see LEARNINGS.md#cockpit-sync

## agent-design-system — PR #3 — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/agent-design-system/prd.md
**Commit:** `git show 0f4c0dd`
**Note:** Per-project design system convention — tokens + 5 HTML blocks (button, card, hero, nav, feature-row) for agent-driven UI composition. Templates in `templates/design-system/`, agent rule at `~/.claude/rules/design-system.md`.

## domain-model-v2 — PR #2 — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/domain-model-v2/prd.md
**Commit:** `git show 0a73e92`
**Decisions:** see LEARNINGS.md#domain-model-v2

## workspace-search — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/workspace-search/prd.md
**Artifacts:** ~/.claude/scripts/workspace-preprocess.sh, ~/.claude/scripts/workspace-reindex.sh, ~/.claude/rules/workspace-search.md
**Note:** Semantic search over workspace markdown artifacts via QMD + MCP. No repo code changes — scripts, configs, and rules live outside git. MCP server configured in ~/.claude.json.

## cockpit — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/cockpit/prd.md
**Commit:** `git show 7bcc630`
**Decisions:** see LEARNINGS.md#cockpit

## ecosystem-map — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/ecosystem-map/prd.md
**Artifact:** ~/.claude/rules/ecosystem-map.md
**Note:** Rules file (auto-loaded in every conversation). No repo code changes — file lives outside git.

## domain-map — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/domain-map/prd.md
**Artifacts:** ~/.claude/schema.yml, ~/.claude/templates/domain-map.html, ~/.claude/scripts/domain-map.sh
**Decisions:** see HANDOVER.md#domain-map

## plan-ux — PR #1 — 2026-03-12
**Type:** feat
**PRD:** ~/.claude/discoveries/fl/plan-ux/prd.md
**Commit:** `git show f94d9a3`
**Decisions:** see LEARNINGS.md#plan-ux
