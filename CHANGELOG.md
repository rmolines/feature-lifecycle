# Changelog

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
