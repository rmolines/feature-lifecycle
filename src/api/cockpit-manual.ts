import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

interface NeedsAttentionItem {
  project: string;
  action: string;
  type: string;
  context: string;
}

interface CockpitManualData {
  needs_attention: NeedsAttentionItem[];
  limbo: string[];
}

/**
 * Simple line-by-line YAML parser for cockpit-manual.yaml.
 * Supports:
 *   - Top-level keys: needs-attention and limbo
 *   - needs-attention: list of dicts with project/action/type/context keys
 *   - limbo: list of plain string values
 */
function parseCockpitManualYaml(content: string): CockpitManualData {
  const result: CockpitManualData = {
    needs_attention: [],
    limbo: [],
  };

  const lines = content.split("\n");
  type TopSection = "needs-attention" | "limbo" | null;
  let currentSection: TopSection = null;
  let currentItem: Partial<NeedsAttentionItem> | null = null;

  const flushItem = () => {
    if (currentItem && currentItem.project !== undefined) {
      result.needs_attention.push({
        project: currentItem.project ?? "",
        action: currentItem.action ?? "",
        type: currentItem.type ?? "",
        context: currentItem.context ?? "",
      });
    }
    currentItem = null;
  };

  for (const rawLine of lines) {
    // Skip comments
    if (rawLine.trim().startsWith("#")) continue;

    // Top-level section detection (no leading spaces)
    if (/^needs-attention:/.test(rawLine)) {
      flushItem();
      currentSection = "needs-attention";
      continue;
    }
    if (/^limbo:/.test(rawLine)) {
      flushItem();
      currentSection = "limbo";
      continue;
    }

    // Skip blank lines
    if (rawLine.trim() === "") continue;

    if (currentSection === "limbo") {
      // Plain list items: "  - value"
      const match = rawLine.match(/^\s+-\s+(.+)$/);
      if (match) {
        result.limbo.push(match[1].trim());
      }
    } else if (currentSection === "needs-attention") {
      // List item start: "  - project: foo" or "  - action: ..."
      const listItemMatch = rawLine.match(/^\s+-\s+(\w[\w-]*):\s*(.*)$/);
      if (listItemMatch) {
        // New list item: flush previous
        flushItem();
        currentItem = {};
        const key = listItemMatch[1].trim();
        const val = listItemMatch[2].trim();
        assignNeedsAttentionField(currentItem, key, val);
        continue;
      }

      // Continuation dict key under an existing item: "    action: foo"
      const dictKeyMatch = rawLine.match(/^\s{4,}(\w[\w-]*):\s*(.*)$/);
      if (dictKeyMatch && currentItem !== null) {
        const key = dictKeyMatch[1].trim();
        const val = dictKeyMatch[2].trim();
        assignNeedsAttentionField(currentItem, key, val);
      }
    }
  }

  // Flush last item
  flushItem();

  return result;
}

function assignNeedsAttentionField(
  item: Partial<NeedsAttentionItem>,
  key: string,
  val: string
): void {
  switch (key) {
    case "project": item.project = val; break;
    case "action": item.action = val; break;
    case "type": item.type = val; break;
    case "context": item.context = val; break;
  }
}

export async function handleCockpitManual(): Promise<Response> {
  try {
    const manualPath = join(homedir(), ".claude", "cockpit-manual.yaml");

    if (!existsSync(manualPath)) {
      return jsonResponse({ needs_attention: [], limbo: [] });
    }

    let content: string;
    try {
      content = await readFile(manualPath, "utf-8");
    } catch (err) {
      return errorResponse(`Failed to read cockpit-manual.yaml: ${String(err)}`, 500);
    }

    const data = parseCockpitManualYaml(content);
    return jsonResponse(data);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}
