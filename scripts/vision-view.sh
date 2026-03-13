#!/usr/bin/env bash
# vision-view.sh — Parse a vision.md into JSON and open as rich HTML visualization
# Usage: bash scripts/vision-view.sh <vision.md>

set -euo pipefail

VISION_FILE="${1:-}"

if [[ -z "$VISION_FILE" ]]; then
  echo "Usage: bash $0 <vision.md>" >&2
  exit 1
fi

if [[ ! -f "$VISION_FILE" ]]; then
  echo "Error: vision file not found: $VISION_FILE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../templates/vision-view.html"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Error: template not found: $TEMPLATE" >&2
  exit 1
fi

# ─── Parse vision.md with Python3 ────────────────────────────────────────────

TIMESTAMP=$(date +%s)
JSON_TMP="/tmp/vision-view-json-${TIMESTAMP}.json"
OUTPUT="/tmp/vision-view-${TIMESTAMP}.html"

python3 - "$VISION_FILE" "$JSON_TMP" <<'PYEOF'
import sys
import re
import json

vision_path = sys.argv[1]
json_path = sys.argv[2]

with open(vision_path, 'r') as f:
    content = f.read()

def strip_inline_md(text):
    """Remove basic markdown bold/italic markers."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    return text.strip()

# ── Frontmatter ──────────────────────────────────────────────────────────────
fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
frontmatter = {}
if fm_match:
    for line in fm_match.group(1).splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            frontmatter[k.strip()] = v.strip()

proj_id = frontmatter.get('id', '')
status = frontmatter.get('status', 'draft')
created = frontmatter.get('created', '')
updated = frontmatter.get('updated', '')

# Tags: [mobile, ios, cycling] → list
tags_raw = frontmatter.get('tags', '[]')
tags = [t.strip().strip('"\'') for t in re.sub(r'[\[\]]', '', tags_raw).split(',') if t.strip()]

# ── Strip frontmatter from content ──────────────────────────────────────────
body = re.sub(r'^---\n.*?\n---\n?', '', content, flags=re.DOTALL)

def get_section(body, heading):
    """Extract content between ## heading and next ## heading."""
    pattern = rf'^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)'
    m = re.search(pattern, body, re.DOTALL | re.MULTILINE)
    if m:
        return m.group(1).strip()
    return ''

# ── Thesis ────────────────────────────────────────────────────────────────────
thesis_section = get_section(body, 'Thesis')
kill_match = re.search(r'^### Kill condition\s*\n(.*?)(?=^###|\Z)', thesis_section, re.DOTALL | re.MULTILINE)
kill_condition = kill_match.group(1).strip() if kill_match else ''

# Thesis is content before any ### heading
thesis_text = re.split(r'^###', thesis_section, flags=re.MULTILINE)[0].strip()

# ── Audience ─────────────────────────────────────────────────────────────────
audience_section = get_section(body, 'Audience')
primary_m = re.search(r'-\s*\*\*Primary:\*\*\s*(.*?)(?=^-\s*\*\*|\Z)', audience_section, re.DOTALL | re.MULTILINE)
secondary_m = re.search(r'-\s*\*\*Secondary:\*\*\s*(.*?)(?=^-\s*\*\*|\Z)', audience_section, re.DOTALL | re.MULTILINE)

def clean_audience(text):
    if not text:
        return ''
    # Join continuation lines (indented or just continuation)
    lines = text.strip().splitlines()
    return ' '.join(l.strip() for l in lines if l.strip())

audience = {
    'primary': clean_audience(primary_m.group(1)) if primary_m else '',
    'secondary': clean_audience(secondary_m.group(1)) if secondary_m else '',
}

# ── Milestones ────────────────────────────────────────────────────────────────
milestones_section = get_section(body, 'Milestones')
milestone_blocks = re.split(r'^(?=### M\d+:)', milestones_section, flags=re.MULTILINE)

milestones = []
for block in milestone_blocks:
    block = block.strip()
    if not block:
        continue
    header_m = re.match(r'^### (M\d+):\s*(.*)', block)
    if not header_m:
        continue
    m_id = header_m.group(1)
    m_name = header_m.group(2).strip()

    # Description: first paragraph after header (before bullet fields)
    after_header = block[header_m.end():].strip()
    desc_lines = []
    for line in after_header.splitlines():
        if line.startswith('- **'):
            break
        desc_lines.append(line)
    description = ' '.join(l.strip() for l in desc_lines if l.strip())

    def get_field(block, field):
        m = re.search(rf'-\s*\*\*{re.escape(field)}:\*\*\s*(.*?)(?=\n-\s*\*\*|\Z)', block, re.DOTALL)
        if m:
            return ' '.join(l.strip() for l in m.group(1).strip().splitlines() if l.strip())
        return ''

    bet = get_field(block, 'Bet')
    entry = get_field(block, 'Entry')
    depends_on = get_field(block, 'Depends on')
    m_kill = get_field(block, 'Kill condition')

    # Blockers
    blockers = []
    in_blockers = False
    for line in block.splitlines():
        if re.match(r'-\s*\*\*Blockers:\*\*', line):
            in_blockers = True
            continue
        if in_blockers:
            cb_m = re.match(r'\s+-\s+\[([ x])\]\s+(.*)', line)
            if cb_m:
                checked = cb_m.group(1) == 'x'
                blockers.append({'text': cb_m.group(2).strip(), 'checked': checked})
            elif re.match(r'-\s*\*\*', line):
                in_blockers = False

    milestones.append({
        'id': m_id,
        'name': m_name,
        'description': description,
        'bet': bet,
        'entry': entry,
        'depends_on': depends_on,
        'kill_condition': m_kill,
        'blockers': blockers,
    })

# ── Strategy ─────────────────────────────────────────────────────────────────
strategy_section = get_section(body, 'Strategy')

def get_strategy_field(section, field):
    m = re.search(rf'-\s*\*\*{re.escape(field)}:\*\*\s*(.*?)(?=\n-\s*\*\*|\Z)', section, re.DOTALL)
    if m:
        return ' '.join(l.strip() for l in m.group(1).strip().splitlines() if l.strip())
    return ''

strategy = {
    'platform': get_strategy_field(strategy_section, 'Platform'),
    'monetization': get_strategy_field(strategy_section, 'Monetization'),
    'distribution': get_strategy_field(strategy_section, 'Distribution'),
}

# ── Risks validated ───────────────────────────────────────────────────────────
risks_val_section = get_section(body, 'Risks validated')
risks_validated = []
for line in risks_val_section.splitlines():
    line = line.strip()
    if not line or line.startswith('|---') or line.startswith('| Risk'):
        continue
    if line.startswith('|'):
        cols = [c.strip() for c in line.strip('|').split('|')]
        if len(cols) >= 5:
            risks_validated.append({
                'risk': cols[0],
                'type': cols[1],
                'method': cols[2],
                'decision': cols[3],
                'artifact': cols[4],
            })

# ── Risks accepted ────────────────────────────────────────────────────────────
risks_acc_section = get_section(body, 'Risks accepted')
risks_accepted = []
for line in risks_acc_section.splitlines():
    line = line.strip()
    m = re.match(r'^-\s+(.*)', line)
    if m:
        text = m.group(1).strip()
        if text and text != '(nenhum por enquanto)':
            risks_accepted.append(text)

# ── Pending investigations ────────────────────────────────────────────────────
pending_section = get_section(body, 'Pending investigations')
pending_blocks = re.split(r'^(?=### \d+)', pending_section, flags=re.MULTILINE)

pending_investigations = []
for block in pending_blocks:
    block = block.strip()
    if not block:
        continue
    header_m = re.match(r'^### (\d+)\s*[—-]\s*(.*)', block)
    if not header_m:
        continue
    p_num = header_m.group(1).strip()
    p_title = header_m.group(2).strip()
    p_content = block[header_m.end():].strip()
    pending_investigations.append({
        'number': p_num,
        'title': p_title,
        'content': p_content,
    })

# ── Investigation cycles ──────────────────────────────────────────────────────
cycles_section = get_section(body, 'Investigation cycles')
cycles = []
for line in cycles_section.splitlines():
    line = line.strip()
    if not line or line.startswith('|---') or line.startswith('| #'):
        continue
    if line.startswith('|'):
        cols = [c.strip() for c in line.strip('|').split('|')]
        if len(cols) >= 4:
            cycles.append({
                'number': cols[0],
                'type': cols[1],
                'description': cols[2],
                'date': cols[3],
            })

# ── Assemble ─────────────────────────────────────────────────────────────────
result = {
    'id': proj_id,
    'status': status,
    'created': created,
    'updated': updated,
    'tags': tags,
    'thesis': thesis_text,
    'kill_condition': kill_condition,
    'audience': audience,
    'milestones': milestones,
    'strategy': strategy,
    'risks_validated': risks_validated,
    'risks_accepted': risks_accepted,
    'pending_investigations': pending_investigations,
    'cycles': cycles,
}

with open(json_path, 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
PYEOF

# ─── Inject into HTML template ───────────────────────────────────────────────

python3 - "$TEMPLATE" "$JSON_TMP" "$OUTPUT" <<'PYEOF'
import sys

template_path = sys.argv[1]
json_path = sys.argv[2]
output_path = sys.argv[3]

with open(template_path, 'r') as f:
    template = f.read()

with open(json_path, 'r') as f:
    json_data = f.read()

result = template.replace('__VISION_DATA__', json_data)

with open(output_path, 'w') as f:
    f.write(result)
PYEOF

rm -f "$JSON_TMP"

# ─── Open in browser and report ──────────────────────────────────────────────

open "$OUTPUT"
echo "$OUTPUT"
