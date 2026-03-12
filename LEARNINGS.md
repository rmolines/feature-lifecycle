## domain-map

- Bash-to-JS data contract (list vs. dict) is not caught by render tests. `domain-map.sh` emitted artifacts as a Python list; the JS template consumed it as a keyed object. The HTML rendered correctly (pipeline, phases, cards), so 7/8 success criteria passed. Only the criterion that accessed a specific key (`artifact["draft"]`) failed. Lesson: when a shell script produces JSON consumed by JS, add an explicit success criterion that reads a key from the emitted object — don't rely on visual render alone to validate data shape.

## plan-ux

- `awk -v` strips backslashes from variable values, making it unreliable for injecting JSON into HTML templates. The DAG parsing stays in awk, but template injection must use Python (or `sed` reading from a temp file). Document this constraint whenever a script needs to pass arbitrary user content into awk variables.
- The awk DAG/results parser only handles single-line field values. Multi-line values (e.g., a summary spanning two lines) will be silently truncated to the first line. This is a known limitation that future parsers should either document explicitly or replace with a Python/jq-based parser.
- YAML frontmatter standardization (`discovery.md`, `ship.md`, `prd-template.md`) was delivered in the same commit as plan-ux but was not in the original PRD scope. It was a necessary dependency — ship.md's archive logic and discovery.md's status reads needed a consistent frontmatter contract to support future tooling. When a feature depends on a schema that isn't yet standardized, standardizing it in the same PR is lower risk than treating it as a separate ticket.
