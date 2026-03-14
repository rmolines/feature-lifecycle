# Launchpad — Agent Notes

## Pitfalls

### MCP and HTTP are separate processes
The MCP server (`src/index.ts`) handles CRUD tools over stdio. The HTTP server
(`src/serve.ts` → `src/server.ts`) serves views on port 3333 with WebSocket
auto-refresh. They are independent — MCP must never import or start the HTTP server.
Skills that open views call `bash ~/git/launchpad/scripts/ensure-server.sh` first
to guarantee the HTTP server is running. No bash scripts generate HTML.

### `status:` frontmatter is stale — derive status from the filesystem
As of domain-model-v2, discovery status is derived from filesystem artifacts by
`scripts/derive-status.sh` (bash) or `src/tools/status.ts` (TypeScript), not from the
`status:` field in `draft.md` or `prd.md` frontmatter. Reading `status:` directly will
return stale or incorrect data.

- Use `derive_status <discovery_dir>` (source `scripts/derive-status.sh` first).
- Or use the API: `GET /api/initiatives/:mission/:module/status`.
- `ship.md` archives by moving the directory to `archived/`; it no longer patches
  `status: archived` into frontmatter. Do not rely on frontmatter to detect archived state.

### `session_analyzer.py` — `usage` field excludes subagent tokens; `cost` field includes them
`parse_transcript()` returns a dict where `usage` contains only the main session's token
counts (from the root `.jsonl`). Subagent tokens are parsed separately and added to `cost`,
but **not** merged back into `usage`. The display in `format_session_report` adds them
manually for the printed total, and `aggregate_sessions` sums subagent tokens inline.

Any code that reads `parsed["usage"]` directly and derives cost or total tokens from it
will silently under-count. Always use `parsed["cost"]` for cost, and replicate the
`format_session_report` pattern (main usage + iterate `subagent_summaries`) for token
totals.

### `updateStatusCache` writes `status:` to draft.md but `DraftSchema` doesn't declare it
`status.ts` → `updateStatusCache()` reads `draft.md`, sets `doc.data.status = status`,
and writes it back. Every MCP tool that mutates state (create, finalize, add_cycle)
writes a `status:` key into `draft.md` frontmatter.

However, `DraftSchema` has no `status` field. Zod strips unknown keys from validated
output, but `init_update_fields` serializes the merged raw object (not the validated
output), so `status:` persists on disk. Two failure modes:

1. An agent reads `draft.md` frontmatter and trusts `status:` — gets a cached,
   potentially stale value instead of the live filesystem-derived status.
2. `init_update_fields` merges incoming fields over `parsed.data` (which includes
   cached `status:`), validates with Zod (which strips it), but then serializes the
   raw merged object (which retains it).

Rule: never read `status:` from `draft.md` frontmatter. Always call `init_get_status`
or `deriveStatus()`. Do not assume `init_update_fields` strips unknown frontmatter
fields.

### Reading initiatives files — QMD fallback to bash cat
A guard hook blocks `Read`, `Write`, and `Edit` tools on `~/.claude/initiatives/` and
`~/.claude/discoveries/`. The hook directs to QMD tools, but files may not be indexed.

**Strategy (one attempt, then fallback):**
1. Try `qmd.get` with the exact relative path (e.g. `initiatives/fl/feature/plan.md`)
2. If QMD returns "not found" → immediately use `Bash(cat <full-path>)` as fallback
3. Do NOT retry with `multi_get`, `query`, or other QMD search variants — if `qmd.get`
   can't find the file by exact path, search variants won't find it either

This applies to all skills that read from initiatives: delivery, review, planning, ship,
portfolio-review.

### `console.log` corrupts MCP stdio — use `process.stderr.write` exclusively
The MCP server communicates over stdio. Any call to `console.log` writes to stdout,
which interleaves with the MCP protocol stream and causes the client to receive
malformed JSON-RPC messages. The failure is silent: the MCP client drops the message
or disconnects with no useful error.

All logging in this codebase uses `process.stderr.write(...)` directly. Never add
`console.log` calls anywhere under `src/`. For debug output, always use
`process.stderr.write("[tag] message\n")`.

### Requirements format must be exact — `- **R<N>:** <text>`
The plan-view parser (both legacy bash and `src/api/plans.ts`) only recognises
requirement lines matching exactly `- **R<N>:** <text>`. Any deviation — missing
bold markers (`- R1: text`), bold without trailing colon (`- **R1** text`), or
leading whitespace — causes the parser to return empty. The requirements panel
disappears silently.

Always use the exact format from `templates/plan-template.md` and `templates/prd-template.md`.
