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
