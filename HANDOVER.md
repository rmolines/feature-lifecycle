# Handover

## plan-ux — 2026-03-12

**What:** plan.md is agent-optimized but unreadable for humans doing pre-approval or post-delivery review. Results also vanish when the chat session ends. This feature adds an HTML visualization of any plan.md and persists delivery results to disk.

**PR:** #1 (f94d9a3)

**Key decisions:**
- Added `title`, `batch`, `files` fields to the Execution DAG instead of parsing the separate `## Batches` section — that section is inconsistent across existing plans; the DAG is the single source of truth for the HTML view.
- HTML template is static and versioned (`templates/plan-view.html`), never LLM-generated — the bash script injects JSON at render time, keeping costs at ~0 tokens.
- `results.md` uses the same key:value block format as the DAG — one parser handles both.
- `/planning` opens the HTML view automatically after saving plan.md; `/delivery` does the same with `--results` after all batches complete.

**Pitfalls discovered:**
- Some existing plan.md files wrap the DAG in code fences (``` ) and include HTML comments — the parser must strip these or it silently produces broken JSON.
- The `## Batches` section heading and format vary across plans (inconsistent indentation, missing gates) — it cannot be reliably parsed; `batch` field in the DAG is the fix.
- `sed -i` behaves differently on macOS vs GNU Linux — use temp files or `sed -i ''` for portability.

**Key files:**
- `/Users/rmolines/git/launchpad/scripts/plan-view.sh` (new)
- `/Users/rmolines/git/launchpad/templates/plan-view.html` (new)
- `/Users/rmolines/git/launchpad/templates/schemas.md` — Schema 2 updated (title/batch/files), Schema 5 added (results.md format)
- `/Users/rmolines/git/launchpad/templates/plan-template.md` — DAG blocks updated with new fields
- `/Users/rmolines/git/launchpad/commands/planning.md` — generates enriched DAG, runs plan-view.sh after save
- `/Users/rmolines/git/launchpad/commands/delivery.md` — persists results.md, runs plan-view.sh --results after final batch

**Next steps:**
- Validate plan-view.sh against all 5 existing plan.md files end-to-end (the awk parser was validated but the full HTML pipeline was not smoke-tested on all of them).
- Consider a `/results` skill that opens the HTML view for a past delivery without re-running delivery.
- Kanban/cockpit view across all features is explicitly out-of-scope here but is a natural next feature once the YAML frontmatter on Bets is standardized.

## domain-map — 2026-03-12

**What:** HTML standalone que visualiza o pipeline de iniciativas do launchpad como view dinâmica com 8 fases, populada com instâncias reais do filesystem via schema-scan JSON.

**Deliverables:**
- schema.yml: added `results` and `reviews` tables + relationships
- ~/.claude/templates/domain-map.html: pipeline view template (8 phases, cards, modal, dark theme)
- ~/.claude/scripts/domain-map.sh: generation script (scan → compute phases → inject → browser)

**Key decisions:**
- Phase derived from filesystem artifacts, not manual status field
- Artifacts as dict with booleans (fix from review: was list, caused modal bug)
- Path co-location for relationships (bet/prd/plan/results/review share directory)

**Pitfalls:**
- artifacts_present() must return dict, not list — JS template indexes by string key

**Next steps:**
- fl/domain-model-v2: rename Bet→Initiative, derived status as ecosystem standard
- fl/mission-control: integrate as tab in unified shell

**Key files:**
- ~/.claude/schema.yml (results + reviews tables)
- ~/.claude/templates/domain-map.html
- ~/.claude/scripts/domain-map.sh

## domain-model-v2 — 2026-03-12

**What:** O domain model do launchpad havia crescido organicamente, acumulando inconsistências: o conceito "Bet" não comunicava o pipeline de entrega, o `status:` manual no frontmatter criava duas fontes de verdade junto com a lógica derivada já presente no cockpit.sh, e a flag `--sketch` estava acoplada a skills que não deveriam criar drafts. Este PRD formalizou o domain model com 6 mudanças: rename Bet→Initiative, status derivado dos artefatos como fonte canônica, /draft como skill separada de captura rápida, campos `priority:` e `supersedes:` no frontmatter, e absorção do query-layer restante nos templates e skills.

**Key decisions:**
- `derive_status()` extraída como script compartilhado (`scripts/derive-status.sh`) sourced por cockpit.sh e disponível para todas as skills — elimina a duplicação entre `determine_phase()` e o campo manual.
- `status:` removido do frontmatter de draft.md e prd.md sem fallback/cache — status derivado é a única fonte de verdade. vision.md é exceção: lifecycle de visão não é derivável de artefatos.
- `/draft` é skill nova (não refactor de `--sketch`) — UX de bloco de notas com máximo 2 perguntas, discovery e vision apenas consomem drafts.
- `supersedes:` é unidirecional — v2 aponta para v1, v1 não referencia v2. Simplicidade sem grafo bidirecional.
- Rename usa "Initiative" em inglês (não "Iniciativa") para consistência com o codebase.
- `bet_counts` → `initiative_counts` no JSON output do cockpit.sh + cockpit.html — breaking change da API interna.
- ship.md muda de `sed status: archived` para `mv` do diretório para `archived/` — derive_status detecta o path pai.

**Pitfalls discovered:**
- Nenhum novo pitfall além dos já documentados no CLAUDE.md (`__COCKPIT_DATA__` e `__PLAN_DATA__` como placeholders que não podem aparecer em conteúdo de artefatos).
- Artifacts existentes ficam com `status:` stale no frontmatter até cleanup orgânico — campo é ignorado por derive_status, inconsistência temporária aceita.

**Next steps:**
- Executar D1+D2 em paralelo (derive-status.sh + cockpit refactor, rename Bet→Initiative em docs/templates).
- Gate humano: verificar lógica de derive_status.sh e spot-check thesis.md para "Initiative".
- Executar D3+D4+D5 em paralelo (draft skill, discovery/vision updates, ship archival).
- Migração incremental dos ~24 artifacts existentes que têm `status:` no frontmatter (não via script — cleanup nos próximos deliverables).

**Key files:**
- `~/git/launchpad/scripts/derive-status.sh` (novo — D1)
- `~/git/launchpad/scripts/cockpit.sh` (refatorado — D1)
- `~/git/launchpad/templates/cockpit.html` (bet_counts → initiative_counts — D1)
- `~/git/launchpad/commands/draft.md` (novo — D3)
- `~/git/launchpad/templates/prd-template.md` (remove status:, adiciona priority: e supersedes: — D3)
- `~/git/launchpad/commands/discovery.md` (remove --sketch, para de escrever status: — D4)
- `~/git/launchpad/commands/vision.md` (remove --sketch — D4)
- `~/git/launchpad/commands/ship.md` (mv para archived/ em vez de sed — D5)
- `~/git/launchpad/docs/thesis.md`, `docs/contracts.md`, `README.md` (rename — D2)
- `~/git/launchpad/templates/schemas.md`, `templates/vision-template.md` (rename — D2)
- `~/.claude/rules/ecosystem-map.md` (bet → initiative — D2)

## cockpit — 2026-03-12

**What:** 5 HTMLs temáticos (schema-explorer, domain-map, bowl, plan-view, cockpit.md) existiam isolados sem navegação entre si e sem ponto central de acesso. O usuário criava artefatos que depois não conseguia encontrar ou usar. Esta feature unifica tudo em um único `cockpit.html` com 5 abas funcionais, populado por um `cockpit.sh` que escaneia `~/.claude/discoveries/` via grep/awk sem dependência de LLM.

**Key decisions:**
- Mesmo padrão de `plan-view.sh`: bash escaneia filesystem → monta JSON → injeta via Python `str.replace('__COCKPIT_DATA__', json_data)` → abre no browser.
- Design system unificado baseado em schema-explorer + domain-map (dark indigo, Fira Code, `#0f1117` bg) — bowl e plan-view precisam ser migrados de seus temas originais (zinc e light) para esse sistema.
- `project:` do YAML frontmatter é fonte de verdade para agrupamento, não o path do diretório — alguns bets têm `project: launchpad` mas vivem em `fl/`.
- Fase derivada de artefatos presentes no filesystem (mesma lógica do domain-map), não de campo manual.
- Execução em 3 deliverables: D1 (script) e D2 (template) em paralelo, D3 (wiring + validação) dependente de ambos.

**Pitfalls:**
- `__COCKPIT_DATA__` não pode aparecer no conteúdo das bets (mesmo pitfall do `__PLAN_DATA__` no plan-view.sh) — o Python substitui todas as ocorrências, corrompendo o JSON.

**Next steps:**
- Executar D1 + D2 em paralelo, depois D3 para wiring end-to-end.
- Gate humano após Batch 1: verificar tab bar com 5 abas, Overview com project cards, Pipeline com kanban.
- Potencial follow-up: integrar o `/cockpit` skill para invocar `cockpit.sh` diretamente do chat.

**Key files:**
- `~/git/launchpad/scripts/cockpit.sh` (novo — D1)
- `~/git/launchpad/templates/cockpit.html` (novo — D2)
- `~/.claude/discoveries/fl/cockpit/prd.md`
- `~/.claude/discoveries/fl/cockpit/plan.md`

## cockpit-sync — 2026-03-13

**What:** Unified cockpit data layer that scans repos for `## State` in `project.md`, auto-generates `cockpit.md`, and enriches the HTML dashboard with project cards, progress bars, and grouped pipeline.

**Problem solved:** Portfolio state was fragmented across ~15 repos with incompatible formats. `cockpit.sh` only knew about discoveries — not repos, milestones, or operational state. `cockpit.md` was manual and went stale within days. Audit found: 5 shipped discoveries not archived, wrong milestone counts, entire projects absent, projects with completely wrong state.

**Key decisions:**
- `## State` section in `.claude/project.md` is the single read interface for the cockpit — each repo maintains its internal format (sprint.md, backlog.json) and exposes only `milestone`, `progress`, `next-feature`, `operational` for the portfolio view. Incremental adoption: repos without `## State` appear as "operational" without details.
- `cockpit-manual.yaml` handles content requiring human judgment (needs-attention, limbo) — decoupled from the scan logic so human curation is never overwritten by automation.
- `--refresh` flag produces all three outputs in one run (cockpit.json + cockpit.md + HTML), called from `ship.md` and `delivery.md` lifecycle hooks to keep the cockpit current without manual intervention.

**Pitfalls:**
- Match between discoveries and repos uses `alias` as primary key, fallback to directory name — mismatch is silent (project appears in cockpit twice or without state). Ensure `alias:` in `project.md` matches the discovery directory name exactly.
- `import yaml` may not be available; the YAML parser falls back to awk for the flat `cockpit-manual.yaml` structure — keep that file's format simple (no nested objects).

**Key files changed:**
- `scripts/cockpit.sh` — repo scanning, `## State` parsing, YAML merge, `cockpit.md` generation, `--refresh` flag, expanded `projects[]` JSON schema
- `templates/cockpit.html` — project cards with progress bars, grouped pipeline by project, "Needs Attention" and "Limbo" sections, Initiative nomenclature throughout
- `commands/ship.md` — `cockpit.sh --refresh` hook after archive step
- `commands/delivery.md` — `cockpit.sh --refresh` hook after plan-view step

**Next steps:**
- Add `## State` to each active repo's `.claude/project.md` to populate milestone/progress data (incremental — only repos that want cockpit detail need it).
- Add `SessionStart` staleness check: warn if `cockpit.json` is older than 3 days.
- `portfolio-review` discovery: analysis and prioritization layer on top of the now-reliable cockpit data.

## Session Analyzer — PR #5 — 2026-03-13

**What:** Token consumption across launchpad skills was invisible — optimizations were intuition-based with no data on which skills spend the most, where unnecessary re-reads occur, or whether subagents are used efficiently. This feature adds an on-demand analyzer (`analyze-session.sh`) that parses Claude Code `.jsonl` transcripts and produces per-session token breakdowns, cost estimates, tool call breakdowns, and waste heuristics, plus a `--summary` mode that aggregates the last N sessions grouped by skill.

**Key decisions:**
- Bash + Python 3 stdlib only — no pip dependencies, consistent with existing scripts in `scripts/`.
- Skill detection via `<command-name>` tag in user message content; unmatched sessions labeled "ad-hoc".
- Pricing hardcoded per model (opus, sonnet, haiku) — intentionally kept as a one-line manual update, not auto-fetched.
- Waste heuristics are advisory (reported as "Opportunities:" with ⚠/ℹ), not errors — re-reads can be intentional.
- Subagent transcripts included in the parent session token count; subagent token deduplication is a known open question (see Next steps).
- Three deliverables: D1 (parser + report), D2 (waste heuristics), D3 (--summary aggregation) — D2 and D3 parallelized after D1.

**Pitfalls:**
- Skill detection reads `<command-name>` tags but Claude Code also injects built-in command names (e.g. `/help`, `/clear`) using the same tag format — these pollute the skill grouping in `--summary` mode. Filter is not yet applied (see Next steps).

**Next steps:**
- Filter built-in commands (`/help`, `/clear`, `/init`, etc.) from skill detection so they don't appear as skills in `--summary` output.
- Validate subagent token deduplication: confirm whether subagent usage is already included in the parent session's `message.usage` totals or whether the current double-counting produces inflated costs.

**Key files:**
- `~/git/launchpad/scripts/session_analyzer.py`
- `~/git/launchpad/scripts/analyze-session.sh`
- `~/git/launchpad/commands/tokens.md`

## requirements-as-contract — 2026-03-13

**What:** Promoted Requirements as a first-class PRD section with traceable R<N> IDs, replacing success criteria. Extended traceability across planning (deliverables reference R<N>s), review (evaluator validates each R individually with PASS/PARTIAL/FAIL/UNTESTABLE), and plan-view (requirements panel + per-deliverable badges + header stat counter).

**PR:** #7 (209f640)
**PRD:** ~/.claude/discoveries/launchpad/requirements-as-contract/prd.md

**Key decisions:**
- Requirements replace success criteria completely — they do not coexist. Net cognitive load is zero: same number of items, just promoted and IDed.
- IDs use flat `R<N>` sequential numbering — no namespacing, no hierarchy. If decomposition is needed it's a signal the PRD is too broad.
- `requirements:` field in the DAG is optional and comma-separated — fully backwards-compatible with existing plans (missing field renders without requirement badges, no breakage).
- plan.md gains a `## Requirements` section copied from the PRD so plan-view.sh can access requirement texts without reading prd.md.
- plan-view.sh extracts requirements at parse time and injects them into the JSON payload; HTML derives coverage and status client-side from the tasks data.
- Requirement status in plan-view is derived from deliverable results: all covering tasks success → done; any failed → blocked; any success/partial → in progress; no results → pending.

**Pitfalls discovered:**
- None new beyond existing CLAUDE.md pitfalls (`__PLAN_DATA__` placeholder must not appear in requirement text).

**Next steps:**
- New PRDs should use `## Requirements` with R<N> IDs from the start — existing PRDs in `~/.claude/discoveries/` are not retroactively migrated (accepted in out-of-scope).
- Validate plan-view.sh against existing plan.md files that lack a `## Requirements` section to confirm backwards compatibility in practice.
- Review skill now emits per-R status table; validate that the evaluator model respects the PASS/PARTIAL/FAIL/UNTESTABLE schema on first real review cycle.

**Key files changed:**
- `~/git/launchpad/templates/prd-template.md` — `## Requirements` section added between Problem and Solution; `### Success criteria` removed from Solution (D1)
- `~/git/launchpad/templates/plan-template.md` — `## Requirements` section added; `**Requirements:** R<N>` line added to deliverable format (D1)
- `~/git/launchpad/templates/schemas.md` — `requirements` field added to DAG schema; `## Requirements Status` replaces `## Success Criteria Status` in review schema (D1)
- `~/git/launchpad/commands/discovery.md` — quality gate updated to reference Requirements with R<N> IDs (D2)
- `~/git/launchpad/commands/planning.md` — prompt checklist and deliverable format updated to require R<N> mapping (D2)
- `~/git/launchpad/commands/review.md` — evaluator prompt updated to validate each R<N> individually with PASS/PARTIAL/FAIL/UNTESTABLE (D2)
- `~/git/launchpad/scripts/plan-view.sh` — parses `requirements:` field from DAG and `## Requirements` section from plan.md; injects into JSON (D3)
- `~/git/launchpad/templates/plan-view.html` — requirements overview panel, per-deliverable badges, header stat counter (D3)
