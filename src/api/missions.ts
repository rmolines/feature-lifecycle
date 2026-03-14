import { existsSync, readdirSync, statSync } from "fs";
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

interface ModuleCounts {
  draft: number;
  final: number;
  archived: number;
}

interface MissionEntry {
  id: string;
  alias: string;
  name: string;
  description: string;
  stage: string;
  stage_label: string;
  progress: string;
  next_feature: string;
  operational: boolean;
  module_counts: ModuleCounts;
  total: number;
}

/**
 * Parse a key-value field from a specific ## Section in project.md
 */
function parseProjectField(content: string, section: string, key: string): string {
  const lines = content.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (line.trim() === section) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) {
      break;
    }
    if (inSection) {
      const match = line.match(new RegExp(`^${key}:\\s*(.+)$`));
      if (match) {
        return match[1].trim();
      }
    }
  }
  return "";
}

function hasSection(content: string, section: string): boolean {
  return content.split("\n").some((l) => l.trim() === section);
}

/**
 * Determine module status category from filesystem artifacts.
 * Mirrors derive_status logic: seed/exploring → draft, ready/planned/building/done/approved → final, shipped → archived
 */
function classifyModuleStatus(moduleDir: string): "draft" | "final" | "archived" {
  const archivedParent = join(moduleDir, "..", "archived");
  const moduleName = moduleDir.split("/").pop() ?? "";
  if (existsSync(join(archivedParent, moduleName))) {
    return "archived";
  }

  const hasReview = existsSync(join(moduleDir, "review.md"));
  const hasResults = existsSync(join(moduleDir, "results.md"));
  const hasPlan = existsSync(join(moduleDir, "plan.md"));
  const hasPrd = existsSync(join(moduleDir, "prd.md"));

  if (hasReview || hasResults || hasPlan || hasPrd) {
    return "final";
  }
  return "draft";
}

/**
 * Count modules in a given initiatives dir by alias.
 * Checks ~/.claude/initiatives/<alias>/ for subdirs.
 */
function countModules(alias: string): ModuleCounts {
  const initiativesRoot = join(homedir(), ".claude", "initiatives");
  const missionDir = join(initiativesRoot, alias);
  const counts: ModuleCounts = { draft: 0, final: 0, archived: 0 };

  if (!existsSync(missionDir)) return counts;

  // Count archived subdirs
  const archivedDir = join(missionDir, "archived");
  if (existsSync(archivedDir) && statSync(archivedDir).isDirectory()) {
    const archivedEntries = readdirSync(archivedDir).filter((e) => {
      return statSync(join(archivedDir, e)).isDirectory();
    });
    counts.archived = archivedEntries.length;
  }

  // Count active modules
  const entries = readdirSync(missionDir).filter((e) => {
    if (e === "archived" || e === "_reviews") return false;
    return statSync(join(missionDir, e)).isDirectory();
  });

  for (const entry of entries) {
    const entryDir = join(missionDir, entry);
    const category = classifyModuleStatus(entryDir);
    if (category === "draft") counts.draft++;
    else if (category === "final") counts.final++;
    // active modules won't be "archived" here since we filtered above
  }

  return counts;
}

export async function handleListMissions(): Promise<Response> {
  try {
    const gitRoot = join(homedir(), "git");
    if (!existsSync(gitRoot)) {
      return jsonResponse({ count: 0, missions: [] });
    }

    const missions: MissionEntry[] = [];

    const repoDirs = readdirSync(gitRoot).filter((e) => {
      const full = join(gitRoot, e);
      return statSync(full).isDirectory();
    });

    for (const repoName of repoDirs) {
      const projectMdPath = join(gitRoot, repoName, ".claude", "project.md");
      if (!existsSync(projectMdPath)) continue;

      let content: string;
      try {
        content = await readFile(projectMdPath, "utf-8");
      } catch {
        continue;
      }

      const name = parseProjectField(content, "## Identity", "name") || repoName;
      const alias = parseProjectField(content, "## Identity", "alias") || repoName;
      const description = parseProjectField(content, "## Identity", "description");

      let stage = "";
      let stage_label = "";
      let progress = "";
      let next_feature = "";
      let operational = false;

      if (hasSection(content, "## State")) {
        stage = parseProjectField(content, "## State", "milestone");
        stage_label = parseProjectField(content, "## State", "milestone-label");
        progress = parseProjectField(content, "## State", "progress");
        next_feature = parseProjectField(content, "## State", "next-feature");
        const opVal = parseProjectField(content, "## State", "operational");
        operational = opVal === "true";
      } else {
        operational = true;
      }

      // If operational, clear milestone details (no active stage to show)
      if (operational) {
        stage = "";
        stage_label = "";
        progress = "";
        next_feature = "";
      }

      const module_counts = countModules(alias);
      const total = module_counts.draft + module_counts.final + module_counts.archived;

      missions.push({
        id: repoName,
        alias,
        name,
        description,
        stage,
        stage_label,
        progress,
        next_feature,
        operational,
        module_counts,
        total,
      });
    }

    return jsonResponse({ count: missions.length, missions });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}
