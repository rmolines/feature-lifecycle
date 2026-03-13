# Launchpad — Agent Notes

## Pitfalls

### Template placeholder strings must not appear in content
Scripts that inject JSON into HTML templates via Python `str.replace()` will break
silently if the placeholder string appears inside the JSON content itself. The result
is malformed JSON, a blank browser page, and exit 0 with no error.

| Script | Placeholder | Content surface |
|---|---|---|
| `scripts/plan-view.sh` | `__PLAN_DATA__` | Plan task fields (title, acceptance criteria, files) |
| `scripts/cockpit.sh` | `__COCKPIT_DATA__` | Discovery artifact fields (frontmatter, problem text, plan names, results, review decisions) |

Never use these literal strings in any artifact content, test fixtures, or generated values.

### `status:` frontmatter is stale — derive status from the filesystem
As of domain-model-v2, discovery status is derived from filesystem artifacts by
`scripts/derive-status.sh`, not from the `status:` field in `draft.md` or `prd.md`
frontmatter. Reading `status:` directly will return stale or incorrect data.

- Use `derive_status <discovery_dir>` (source `scripts/derive-status.sh` first).
- `cockpit.sh` already sources it. Any new script that needs status must do the same.
- `ship.md` archives by moving the directory to `archived/`; it no longer patches
  `status: archived` into frontmatter. Do not rely on frontmatter to detect archived state.

### `~/git/cockpit.md` is auto-generated — do not edit it directly
`cockpit.sh --refresh` overwrites `~/git/cockpit.md` entirely via `generate_cockpit_md()`.
Any manual edits to that file are silently lost on the next refresh.

To add manual content to the cockpit use `~/.claude/cockpit-manual.yaml`:
- `needs-attention` — list of `{project, action, type, context}` dicts rendered as a table
- `limbo` — list of project ids excluded from the main listing

### `cockpit-manual.yaml` awk fallback silently drops dict items in `needs-attention`
When PyYAML is unavailable, `cockpit.sh` falls back to an awk parser that only handles
flat string list items (`- some text`). The intended `needs-attention` schema uses dicts:

```yaml
needs-attention:
  - project: foo
    action: Do something
    type: external
    context: path/to/doc.md
```

The awk fallback reads only the first line of each dict entry (`project: foo`) and
discards the remaining keys. The python renderer then calls `item.get('project', '')` on
a plain string, producing an empty table row. Exit code is 0, no error is printed.

Fix: ensure PyYAML is installed (`pip install pyyaml`) so the primary parser runs.
Never use flat string items for `needs-attention` — always use the dict schema above.

### `session_analyzer.py` — `usage` field excludes subagent tokens; `cost` field includes them
`parse_transcript()` returns a dict where `usage` contains only the main session's token
counts (from the root `.jsonl`). Subagent tokens are parsed separately and added to `cost`,
but **not** merged back into `usage`. The display in `format_session_report` adds them
manually for the printed total, and `aggregate_sessions` sums subagent tokens inline.

Any code that reads `parsed["usage"]` directly and derives cost or total tokens from it
will silently under-count. Always use `parsed["cost"]` for cost, and replicate the
`format_session_report` pattern (main usage + iterate `subagent_summaries`) for token
totals.
