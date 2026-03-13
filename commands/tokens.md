---
description: Analyze token usage and cost of Claude Code sessions
---

# /launchpad:tokens

Analyzes token usage, cost, and efficiency of Claude Code sessions.

## Resolve what to analyze

**If `$ARGUMENTS` contains `--summary`:**
Run summary mode — skip to the Summary section below.

**If `$ARGUMENTS` contains a session ID or path:**
Use that session directly.

**If no arguments (default):**
Find the most recent completed session for the current project:

```bash
REPO_PATH=$(git rev-parse --show-toplevel 2>/dev/null)
ENCODED=$(echo "$REPO_PATH" | sed 's|/|-|g; s|^-||')
ls -t ~/.claude/projects/$ENCODED/*.jsonl 2>/dev/null | head -5
```

Show the user the last 5 sessions with date and skill, and ask which to analyze.
If only 1 exists, use it automatically.

## Single session analysis

1. Run the script to get raw data:

```bash
bash ~/git/launchpad/scripts/analyze-session.sh <session-id-or-path>
```

2. Present the raw output to the user.

3. **AI analysis layer** — interpret the data and provide:

   - **Cost assessment:** Is this session's cost typical for this skill? Compare against rough baselines: ad-hoc <$1, discovery $2-5, planning $1-3, delivery $5-15.
   - **Efficiency insights:** Analyze the tool call distribution — are there patterns suggesting waste? High Read count with few unique files = re-reads. Many Bash calls = possible workaround for dedicated tools. High subagent count with low output = overhead.
   - **Waste opportunities:** If the Opportunities section has entries, explain what each means in practical terms and suggest specific fixes (e.g., "add offset/limit to this Read", "cache this glob result").
   - **Subagent ROI:** If subagents exist, assess their token cost vs contribution. A subagent using 60% of tokens but contributing a small summary is low ROI.

   Keep the analysis concise — 3-5 bullet points max. No fluff.

## Summary mode

```bash
bash ~/git/launchpad/scripts/analyze-session.sh --summary $ARGUMENTS
```

If `--last` not specified, default to `--last 10`.

After showing the raw output, add AI analysis:
- Which skill is most expensive and why
- Trends or anomalies (e.g., one skill costs 3x more than others)
- Concrete suggestions for reducing cost on the top spender

## Rules

- Always show the raw script output first, then the AI interpretation below it
- Keep AI analysis actionable — no generic advice, reference specific numbers from the output
- Don't apologize for high costs — just explain what drove them
- If a session looks efficient, say so briefly and move on
