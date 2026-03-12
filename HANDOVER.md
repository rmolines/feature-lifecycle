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
- fl/domain-model-v2: rename Bet→Iniciativa, derived status as ecosystem standard
- fl/mission-control: integrate as tab in unified shell

**Key files:**
- ~/.claude/schema.yml (results + reviews tables)
- ~/.claude/templates/domain-map.html
- ~/.claude/scripts/domain-map.sh
