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
