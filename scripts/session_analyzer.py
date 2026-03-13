#!/usr/bin/env python3
"""
session_analyzer.py — Parse Claude Code .jsonl transcripts and generate token usage reports.

Usage:
  python3 session_analyzer.py <session-id-or-path>
  python3 session_analyzer.py --summary [--project <encoded-path>]
"""

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


# ─── Pricing (per million tokens, as of 2026-03) ──────────────────────────────

PRICING = {
    "claude-opus-4-6":    {"input": 15.0,   "output": 75.0,  "cache_read": 1.50,  "cache_create": 18.75},
    "claude-sonnet-4-6":  {"input": 3.0,    "output": 15.0,  "cache_read": 0.30,  "cache_create": 3.75},
    "claude-haiku-4-5":   {"input": 0.80,   "output": 4.0,   "cache_read": 0.08,  "cache_create": 1.0},
}

PROJECTS_ROOT = Path.home() / ".claude" / "projects"


def _calculate_cost(usage_by_model: dict) -> float:
    """Calculate total cost in USD from token usage broken down by model."""
    total = 0.0
    for model, usage in usage_by_model.items():
        # Fuzzy match: strip version suffix variations
        rates = PRICING.get(model)
        if rates is None:
            # Try prefix match
            for k, v in PRICING.items():
                if model.startswith(k) or k.startswith(model):
                    rates = v
                    break
        if rates is None:
            # Unknown model — skip pricing
            continue
        total += usage.get("input_tokens", 0) / 1_000_000 * rates["input"]
        total += usage.get("output_tokens", 0) / 1_000_000 * rates["output"]
        total += usage.get("cache_read_input_tokens", 0) / 1_000_000 * rates["cache_read"]
        total += usage.get("cache_creation_input_tokens", 0) / 1_000_000 * rates["cache_create"]
    return total


def _parse_jsonl(path: Path) -> list:
    """Parse a .jsonl file, returning list of dicts (ignoring malformed lines)."""
    records = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


def _detect_skill(records: list) -> str:
    """Search user messages for <command-name> tag; return skill name or 'ad-hoc'."""
    pattern = re.compile(r"<command-name>([^<]+)</command-name>")
    for rec in records:
        if rec.get("type") != "user":
            continue
        msg = rec.get("message", {})
        content = msg.get("content", "")
        if isinstance(content, str):
            m = pattern.search(content)
            if m:
                return m.group(1).strip()
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text", "")
                    m = pattern.search(text)
                    if m:
                        return m.group(1).strip()
    return "ad-hoc"


def _accumulate_usage(records: list, usage_totals: dict, usage_by_model: dict):
    """Accumulate token counts from assistant records into the provided dicts."""
    for rec in records:
        if rec.get("type") != "assistant":
            continue
        msg = rec.get("message", {})
        usage = msg.get("usage", {})
        if not usage:
            continue
        model = msg.get("model", "unknown")

        for field in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
            usage_totals[field] += usage.get(field, 0)
            if model not in usage_by_model:
                usage_by_model[model] = defaultdict(int)
            usage_by_model[model][field] += usage.get(field, 0)


def _collect_tool_calls(records: list) -> list:
    """Extract tool calls from assistant content blocks, enriched with response content."""
    # First pass: collect tool results keyed by tool_use_id
    tool_results: dict[str, str] = {}
    for rec in records:
        if rec.get("type") != "user":
            continue
        msg = rec.get("message", {})
        content = msg.get("content", [])
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_result":
                tid = block.get("tool_use_id", "")
                result_content = block.get("content", "")
                if isinstance(result_content, list):
                    # Join text blocks
                    result_content = "\n".join(
                        b.get("text", "") for b in result_content if isinstance(b, dict)
                    )
                tool_results[tid] = result_content if isinstance(result_content, str) else ""

    # Second pass: collect tool_use blocks from assistant records
    calls = []
    for rec in records:
        if rec.get("type") != "assistant":
            continue
        msg = rec.get("message", {})
        for block in msg.get("content", []):
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                inp = block.get("input", {})
                tool_id = block.get("id", "")
                inp_summary = _summarize_tool_input(block.get("name", ""), inp)
                response = tool_results.get(tool_id, "")
                calls.append({
                    "name": block.get("name", ""),
                    "input": inp,
                    "input_summary": inp_summary,
                    "tool_use_id": tool_id,
                    "response": response,
                    "response_lines": response.count("\n") + 1 if response else 0,
                })
    return calls


def _summarize_tool_input(tool_name: str, inp: dict) -> str:
    """Return a short string summarising the tool input."""
    if not isinstance(inp, dict):
        return str(inp)[:80]
    if tool_name == "Read":
        return inp.get("file_path", "")
    if tool_name == "Bash":
        cmd = inp.get("command", "")
        return cmd[:80].replace("\n", " ")
    if tool_name in ("Glob", "Grep"):
        return inp.get("pattern", "")
    if tool_name in ("Edit", "Write"):
        return inp.get("file_path", "")
    if tool_name == "Agent":
        return inp.get("description", "")[:80]
    # Generic fallback: first string value
    for v in inp.values():
        if isinstance(v, str) and v:
            return v[:80]
    return ""


def _parse_subagent(path: Path) -> dict:
    """Parse a single subagent .jsonl file and return a summary dict."""
    records = _parse_jsonl(path)
    usage_totals = defaultdict(int)
    usage_by_model: dict = {}
    _accumulate_usage(records, usage_totals, usage_by_model)

    model = "unknown"
    for rec in records:
        if rec.get("type") == "assistant":
            m = rec.get("message", {}).get("model")
            if m:
                model = m
                break

    # Read agent type from adjacent .meta.json
    meta_path = path.with_suffix(".meta.json")
    agent_type = "Agent"
    if meta_path.exists():
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            agent_type = meta.get("agentType", "Agent")
        except Exception:
            pass

    total = sum(usage_totals.values())
    return {
        "agent_id": path.stem,
        "agent_type": agent_type,
        "model": model,
        "usage": dict(usage_totals),
        "usage_by_model": {k: dict(v) for k, v in usage_by_model.items()},
        "total_tokens": total,
        "cost": _calculate_cost(usage_by_model),
    }


def parse_transcript(path: str | Path) -> dict:
    """
    Parse a Claude Code .jsonl transcript file.

    Returns a dict with:
      session_id, skill, model, timestamps (first/last), token counts,
      tool_calls, subagent_summaries, usage_by_model, cost
    """
    path = Path(path)
    records = _parse_jsonl(path)

    session_id = path.stem

    # Timestamps
    timestamps = [
        rec.get("timestamp")
        for rec in records
        if rec.get("timestamp")
    ]
    ts_first = timestamps[0] if timestamps else None
    ts_last = timestamps[-1] if timestamps else None

    # Skill detection
    skill = _detect_skill(records)

    # Token usage
    usage_totals: dict = defaultdict(int)
    usage_by_model: dict = {}
    _accumulate_usage(records, usage_totals, usage_by_model)

    # Primary model: model with highest output_tokens
    primary_model = "unknown"
    if usage_by_model:
        primary_model = max(
            usage_by_model,
            key=lambda m: usage_by_model[m].get("output_tokens", 0),
        )

    # Tool calls
    tool_calls = _collect_tool_calls(records)

    # Cost
    cost = _calculate_cost(usage_by_model)

    # Subagents
    subagents_dir = path.parent / path.stem / "subagents"
    subagent_summaries = []
    if subagents_dir.is_dir():
        for sa_file in sorted(subagents_dir.glob("agent-*.jsonl")):
            subagent_summaries.append(_parse_subagent(sa_file))
            # Add subagent usage to main cost
            cost += subagent_summaries[-1]["cost"]

    return {
        "session_id": session_id,
        "skill": skill,
        "model": primary_model,
        "ts_first": ts_first,
        "ts_last": ts_last,
        "usage": dict(usage_totals),
        "usage_by_model": {k: dict(v) for k, v in usage_by_model.items()},
        "tool_calls": tool_calls,
        "subagent_summaries": subagent_summaries,
        "cost": cost,
    }


def detect_waste(parsed: dict) -> list:
    """
    Detect waste patterns in a parsed session.

    Returns a list of opportunity dicts, each with:
      type, severity ('⚠' or 'ℹ'), description
    """
    tool_calls = parsed.get("tool_calls", [])
    opportunities = []

    # ── Re-read heuristic ───────────────────────────────────────────────────
    # Same file path read 2+ times without a Write/Edit to that file between reads.
    # Track per-file: list of indices where Read happened; reset on Write/Edit.
    file_read_counts: dict[str, int] = defaultdict(int)

    for tc in tool_calls:
        name = tc["name"]
        summary = tc.get("input_summary", "")
        if name == "Read" and summary:
            file_read_counts[summary] += 1
        elif name in ("Write", "Edit"):
            inp = tc.get("input", {})
            fp = inp.get("file_path", summary)
            # Reset count for this file — a write clears the re-read accumulator
            if fp in file_read_counts:
                file_read_counts[fp] = 0

    for filepath, count in file_read_counts.items():
        if count >= 2:
            opportunities.append({
                "type": "re_read",
                "severity": "⚠",
                "description": f"Re-read: {filepath} read {count}x (no edit between reads)",
            })

    # ── Oversized read heuristic ─────────────────────────────────────────────
    # Read without offset/limit where response has >500 lines.
    OVERSIZE_THRESHOLD = 500
    for tc in tool_calls:
        if tc["name"] != "Read":
            continue
        inp = tc.get("input", {})
        if "offset" in inp or "limit" in inp:
            continue
        lines = tc.get("response_lines", 0)
        if lines > OVERSIZE_THRESHOLD:
            fp = tc.get("input_summary", "")
            opportunities.append({
                "type": "oversized_read",
                "severity": "⚠",
                "description": f"Full read: {fp} ({lines} lines) — consider using offset/limit",
            })

    # ── Redundant search heuristic ───────────────────────────────────────────
    # Same Grep/Glob pattern executed 2+ times.
    search_counts: dict[str, int] = defaultdict(int)
    for tc in tool_calls:
        if tc["name"] in ("Grep", "Glob"):
            pattern = tc.get("input_summary", "")
            if pattern:
                search_counts[pattern] += 1

    for pattern, count in search_counts.items():
        if count >= 2:
            opportunities.append({
                "type": "redundant_search",
                "severity": "ℹ",
                "description": f"Redundant search: '{pattern}' executed {count}x",
            })

    # ── Redundant bash heuristic ─────────────────────────────────────────────
    # Same Bash command executed 2+ times with same output.
    bash_seen: dict[str, list[str]] = defaultdict(list)
    for tc in tool_calls:
        if tc["name"] != "Bash":
            continue
        cmd = tc.get("input_summary", "")
        if cmd:
            bash_seen[cmd].append(tc.get("response", ""))

    for cmd, responses in bash_seen.items():
        if len(responses) >= 2:
            # Check if at least two have the same output
            unique_outputs = set(responses)
            if len(unique_outputs) < len(responses):
                # Some duplicate outputs exist
                output_counts = Counter(responses)
                max_count = output_counts.most_common(1)[0][1]
                if max_count >= 2:
                    total = len(responses)
                    opportunities.append({
                        "type": "redundant_bash",
                        "severity": "ℹ",
                        "description": f"Redundant command: '{cmd[:60]}' executed {total}x",
                    })

    return opportunities


def _duration_str(ts_first: str, ts_last: str) -> str:
    """Return human-readable duration between two ISO timestamps."""
    try:
        fmt = "%Y-%m-%dT%H:%M:%S.%fZ"
        t1 = datetime.strptime(ts_first, fmt).replace(tzinfo=timezone.utc)
        t2 = datetime.strptime(ts_last, fmt).replace(tzinfo=timezone.utc)
        secs = int((t2 - t1).total_seconds())
        if secs < 60:
            return f"{secs}s"
        mins = secs // 60
        rem = secs % 60
        if mins < 60:
            return f"{mins}m {rem}s"
        hrs = mins // 60
        mins = mins % 60
        return f"{hrs}h {mins}m"
    except Exception:
        return "unknown"


def _date_str(ts: str) -> str:
    """Return YYYY-MM-DD from ISO timestamp."""
    try:
        return ts[:10]
    except Exception:
        return "unknown"


def _k(n: int) -> str:
    """Format token count as Nk."""
    return f"{n / 1000:.1f}k"


def format_session_report(parsed: dict) -> str:
    """Return a formatted session report string."""
    lines = []

    short_id = parsed["session_id"][:8]
    date = _date_str(parsed["ts_first"]) if parsed["ts_first"] else "unknown"
    skill = parsed["skill"]

    lines.append(f"Session: {short_id} ({date}, {skill})")

    duration = (
        _duration_str(parsed["ts_first"], parsed["ts_last"])
        if parsed["ts_first"] and parsed["ts_last"]
        else "unknown"
    )
    lines.append(f"  Duration: {duration}")

    usage = parsed["usage"]
    inp = usage.get("input_tokens", 0)
    out = usage.get("output_tokens", 0)
    cr = usage.get("cache_read_input_tokens", 0)
    cc = usage.get("cache_creation_input_tokens", 0)
    total = inp + out + cr + cc

    # Add subagent totals to display
    for sa in parsed.get("subagent_summaries", []):
        sa_u = sa.get("usage", {})
        inp += sa_u.get("input_tokens", 0)
        out += sa_u.get("output_tokens", 0)
        cr += sa_u.get("cache_read_input_tokens", 0)
        cc += sa_u.get("cache_creation_input_tokens", 0)
        total += sa.get("total_tokens", 0)

    lines.append(
        f"  Total tokens: ~{_k(total)} "
        f"(input: {_k(inp)}, output: {_k(out)}, "
        f"cache read: {_k(cr)}, cache create: {_k(cc)})"
    )

    lines.append(f"  Estimated cost: ${parsed['cost']:.4f}")
    lines.append(f"  Model: {parsed['model']}")
    lines.append("")

    # Tool calls summary
    tool_calls = parsed["tool_calls"]
    lines.append(f"  Tool calls: {len(tool_calls)}")

    if tool_calls:
        # Count by tool name
        counter: dict = defaultdict(int)
        read_files: dict = defaultdict(set)
        for tc in tool_calls:
            name = tc["name"]
            counter[name] += 1
            if name == "Read":
                summary = tc.get("input_summary", "")
                if summary:
                    read_files[name].add(summary)

        for name, count in sorted(counter.items(), key=lambda x: -x[1]):
            if name == "Read" and name in read_files:
                unique = len(read_files[name])
                lines.append(f"    {name}: {count} ({unique} unique files)")
            else:
                lines.append(f"    {name}: {count}")

    lines.append("")

    # Subagents
    subagents = parsed.get("subagent_summaries", [])
    lines.append(f"  Subagents: {len(subagents)}")
    for sa in subagents:
        sa_u = sa.get("usage", {})
        sa_total = sa.get("total_tokens", 0)
        sa_inp = sa_u.get("input_tokens", 0)
        sa_out = sa_u.get("output_tokens", 0)
        sa_cr = sa_u.get("cache_read_input_tokens", 0)
        sa_cc = sa_u.get("cache_creation_input_tokens", 0)
        lines.append(
            f"    {sa['agent_type']} ({sa['model']}): "
            f"~{_k(sa_total)} tokens "
            f"(input: {_k(sa_inp)}, output: {_k(sa_out)}, "
            f"cache read: {_k(sa_cr)}, cache create: {_k(sa_cc)})"
        )

    # Opportunities (waste detection)
    opportunities = detect_waste(parsed)
    if opportunities:
        lines.append("")
        lines.append("  Opportunities:")
        for opp in opportunities:
            lines.append(f"    {opp['severity']} {opp['description']}")

    return "\n".join(lines)


def aggregate_sessions(parsed_list: list) -> dict:
    """
    Aggregate token/cost data across multiple parsed session dicts.

    Returns:
      by_skill: dict mapping skill name -> {count, avg_tokens, avg_cost, total_tokens, total_cost}
      total_tokens, total_cost
      period_start, period_end (ISO timestamps)
      session_count
    """
    by_skill: dict = defaultdict(lambda: {"count": 0, "total_tokens": 0, "total_cost": 0.0})

    total_tokens = 0
    total_cost = 0.0
    timestamps = []

    for parsed in parsed_list:
        skill = parsed.get("skill", "ad-hoc") or "ad-hoc"

        # Token total for this session (main + subagents)
        usage = parsed.get("usage", {})
        session_tokens = sum(usage.values())
        for sa in parsed.get("subagent_summaries", []):
            session_tokens += sa.get("total_tokens", 0)

        session_cost = parsed.get("cost", 0.0)

        by_skill[skill]["count"] += 1
        by_skill[skill]["total_tokens"] += session_tokens
        by_skill[skill]["total_cost"] += session_cost

        total_tokens += session_tokens
        total_cost += session_cost

        for ts in (parsed.get("ts_first"), parsed.get("ts_last")):
            if ts:
                timestamps.append(ts)

    # Compute averages
    result_by_skill = {}
    for skill, data in by_skill.items():
        count = data["count"]
        result_by_skill[skill] = {
            "count": count,
            "total_tokens": data["total_tokens"],
            "total_cost": data["total_cost"],
            "avg_tokens": data["total_tokens"] / count if count else 0,
            "avg_cost": data["total_cost"] / count if count else 0.0,
        }

    timestamps.sort()
    return {
        "by_skill": result_by_skill,
        "total_tokens": total_tokens,
        "total_cost": total_cost,
        "period_start": timestamps[0] if timestamps else None,
        "period_end": timestamps[-1] if timestamps else None,
        "session_count": len(parsed_list),
    }


def format_summary_report(aggregated: dict) -> str:
    """Return a formatted multi-session summary string."""
    session_count = aggregated["session_count"]
    period_start = aggregated.get("period_start")
    period_end = aggregated.get("period_end")

    if period_start and period_end:
        date_start = _date_str(period_start)
        date_end = _date_str(period_end)
        if date_start == date_end:
            date_range = date_start
        else:
            date_range = f"{date_start} - {date_end}"
    else:
        date_range = "unknown"

    lines = []
    lines.append(f"Summary: last {session_count} sessions ({date_range})")
    lines.append("")
    lines.append("  By skill:")

    # Sort skills by total_cost descending
    by_skill = aggregated.get("by_skill", {})
    sorted_skills = sorted(by_skill.items(), key=lambda x: x[1]["total_cost"], reverse=True)

    col_width = max((len(skill) for skill, _ in sorted_skills), default=6)

    for skill, data in sorted_skills:
        avg_k = data["avg_tokens"] / 1000
        avg_cost = data["avg_cost"]
        count = data["count"]
        label = skill.ljust(col_width)
        lines.append(
            f"    {label}  avg {avg_k:.1f}k tokens  ${avg_cost:.4f}/session  ({count} sessions)"
        )

    lines.append("")
    total_k = aggregated["total_tokens"] / 1000
    total_cost = aggregated["total_cost"]
    lines.append(f"  Total: ~{total_k:.1f}k tokens, ${total_cost:.4f}")

    return "\n".join(lines)

def find_transcripts(project_path: str | None = None, last_n: int = 30) -> list[Path]:
    """
    Find .jsonl transcript files under ~/.claude/projects/.

    If project_path is given, restrict to that encoded-path subdirectory.
    Returns list of Paths sorted by mtime desc, up to last_n entries.
    """
    if project_path:
        search_root = PROJECTS_ROOT / project_path
        if not search_root.is_dir():
            return []
        candidates = list(search_root.glob("*.jsonl"))
    else:
        candidates = list(PROJECTS_ROOT.glob("*/*.jsonl"))

    # Exclude subagent transcripts (live inside <session-id>/subagents/)
    candidates = [p for p in candidates if "subagents" not in p.parts]

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[:last_n]


def _find_transcript_by_id(session_id: str) -> Path | None:
    """Find transcript by full or partial session UUID."""
    # Search all project dirs
    for candidate in PROJECTS_ROOT.glob("*/*.jsonl"):
        if "subagents" in candidate.parts:
            continue
        if candidate.stem.startswith(session_id) or candidate.stem == session_id:
            return candidate
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Analyze Claude Code session transcripts."
    )
    parser.add_argument(
        "session",
        nargs="?",
        help="Session ID (full or partial UUID) or path to .jsonl file",
    )
    parser.add_argument(
        "--project",
        help="Encoded project path (e.g. -Users-rmolines-git-launchpad)",
        default=None,
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Aggregate summary across multiple sessions",
    )
    parser.add_argument(
        "--last",
        type=int,
        default=30,
        metavar="N",
        help="Number of most-recent sessions to analyze (default: 30, used with --summary)",
    )
    args = parser.parse_args()

    if args.summary:
        paths = find_transcripts(project_path=args.project, last_n=args.last)
        if not paths:
            print("No transcripts found.", file=sys.stderr)
            sys.exit(1)
        parsed_list = []
        for p in paths:
            try:
                parsed_list.append(parse_transcript(p))
            except Exception as e:
                print(f"Warning: failed to parse {p}: {e}", file=sys.stderr)
        if not parsed_list:
            print("No sessions could be parsed.", file=sys.stderr)
            sys.exit(1)
        aggregated = aggregate_sessions(parsed_list)
        print(format_summary_report(aggregated))
        sys.exit(0)

    if not args.session:
        parser.print_help()
        sys.exit(1)

    # Resolve path
    session_arg = args.session
    if os.path.isfile(session_arg):
        transcript_path = Path(session_arg)
    else:
        transcript_path = _find_transcript_by_id(session_arg)
        if transcript_path is None:
            print(f"Error: no transcript found for session id '{session_arg}'", file=sys.stderr)
            sys.exit(1)

    parsed = parse_transcript(transcript_path)
    print(format_session_report(parsed))


if __name__ == "__main__":
    main()
