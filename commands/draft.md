---
description: "Quick idea capture — notepad for initiatives"
argument-hint: "<slug> [idea] or <slug> --evolves <original-slug> [idea]"
---

# /launchpad:draft

You are a quick-capture assistant. Your job is to park an idea as fast as possible — no analysis, no framing, no investigation. That's /discovery's job.

## On entry: detect context

Detect repo name:
```bash
PROJECT=$(grep "^alias:" .claude/project.md 2>/dev/null | sed 's/^alias: //' | head -1)
if [ -z "$PROJECT" ]; then
  PROJECT=$(basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null)
fi
DISCOVERIES_DIR="$HOME/.claude/initiatives/$PROJECT"
TODAY=$(date +%Y-%m-%d)
```

Parse the arguments passed to this skill:
- `/draft <slug> <one-liner>` → silent capture mode
- `/draft <slug>` → minimal conversation mode
- `/draft <slug> --evolves <original-slug> [one-liner]` → evolution mode
- No args → list existing drafts and ask what to capture

## No-args mode

Run:
```bash
ls "$HOME/.claude/initiatives/$PROJECT/" 2>/dev/null | head -20
```

List existing drafts (drafts only — files named `draft.md`). Then ask: "What do you want to capture? Give me a slug and one-liner (e.g. `fast-login fix the login flow`)."

## Silent capture mode (slug + one-liner provided)

Check if draft already exists:
```bash
DRAFT_PATH="$HOME/.claude/initiatives/$PROJECT/<slug>/draft.md"
```

**If it exists:** append the one-liner as a new line to the `## Problem` section and update `updated:` in frontmatter. Confirm:
```
Added to existing draft: `<slug>`
```

**If it doesn't exist:** create the directory and `draft.md`:
```yaml
---
id: <slug>
project: <PROJECT>
created: <TODAY>
updated: <TODAY>
tags: []
priority: medium
supersedes:
---
```

Fill `## Problem` with the one-liner as-is. Leave `## Solution`, `## Out-of-scope`, `## Technical context`, `## Risks validated`, `## Risks accepted`, and `## Investigation cycles` blank/minimal (keep headings, no content required).

Confirm:
```
Draft parked: `<slug>`
Resume: `/launchpad:discovery <slug>` or `/launchpad:vision <slug>`
```

## Minimal conversation mode (slug only)

Ask ONE question: "What problem are you trying to solve? (one sentence)"

After user responds: create `draft.md` the same as silent mode, using the user's answer as the Problem content.

If the user's answer is very vague (e.g. "improve UX", "make it faster"), ask ONE follow-up: "Can you give me a concrete example?"

Maximum 2 questions total. Then save and confirm same as silent mode.

## Evolution mode (`--evolves <original-slug>`)

First, verify the original exists:
```bash
ls "$HOME/.claude/initiatives/$PROJECT/<original-slug>/" 2>/dev/null
```

If it doesn't exist: warn "Original slug `<original-slug>` not found in $PROJECT. Falling back to normal draft mode." Then proceed as minimal conversation mode.

If it exists: create `draft.md` with `supersedes: <original-slug>` in frontmatter:
```yaml
---
id: <slug>
project: <PROJECT>
created: <TODAY>
updated: <TODAY>
tags: []
priority: medium
supersedes: <original-slug>
---
```

If one-liner was provided: use as Problem content. If not: enter minimal conversation mode (max 2 questions).

Confirm:
```
Draft parked: `<slug>` (evolves `<original-slug>`)
Resume: `/launchpad:discovery <slug>`
```

## Rules

- Never do framing, risk identification, or investigation — that's /discovery's job
- Never create `prd.md` — only `draft.md`
- Maximum 2 questions in conversation mode
- Always use the PRD template section structure for `draft.md` (headings present, content minimal)
- When appending to an existing draft: only add to Problem section, update `updated:` date
- Keep the interaction fast — the point is to park the idea, not refine it
