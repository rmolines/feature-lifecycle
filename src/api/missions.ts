import { existsSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import {
  getMissionsRoot,
  listStages,
  listModules,
  resolveModulePath,
} from "../parser.js";

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

interface ModuleEntry {
  id: string;
  stage: string;
  status: string;
  artifacts: string[];
}

interface StageEntry {
  id: string;
  name: string;
  hypothesis: string;
  modules: ModuleEntry[];
  module_count: number;
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
  stages: StageEntry[];
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
      if (match && match[1] !== undefined) {
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
  const hasPrd = existsSync(join(moduleDir, "prd.md")) || existsSync(join(moduleDir, "module.md"));

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

/**
 * Read stage.md for name/hypothesis fields if it exists.
 */
async function readStageMeta(stageDir: string): Promise<{ name: string; hypothesis: string }> {
  const stageMdPath = join(stageDir, "stage.md");
  if (!existsSync(stageMdPath)) {
    return { name: "", hypothesis: "" };
  }
  try {
    const content = await readFile(stageMdPath, "utf-8");
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const hypothesisMatch = content.match(/^hypothesis:\s*(.+)$/m);
    return {
      name: (nameMatch && nameMatch[1] !== undefined) ? nameMatch[1].trim() : "",
      hypothesis: (hypothesisMatch && hypothesisMatch[1] !== undefined) ? hypothesisMatch[1].trim() : "",
    };
  } catch {
    return { name: "", hypothesis: "" };
  }
}

/**
 * Build stage entries for a mission from the missions filesystem.
 */
async function buildStageEntries(mission: string): Promise<StageEntry[]> {
  const stageIds = listStages(mission);
  const stageEntries: StageEntry[] = [];

  for (const stageId of stageIds) {
    const missionsRoot = getMissionsRoot();
    const stageDir = join(missionsRoot, mission, stageId);
    const meta = await readStageMeta(stageDir);

    const stageName = meta.name || (stageId === "_backlog" ? "Backlog" : stageId);
    const moduleIds = listModules(mission, stageId);
    const moduleEntries: ModuleEntry[] = [];

    for (const moduleId of moduleIds) {
      const moduleDir = resolveModulePath(mission, stageId, moduleId);
      if (!existsSync(moduleDir)) continue;

      let status = "seed";
      let artifacts: string[] = [];
      try {
        const files = readdirSync(moduleDir).filter((f) =>
          ["draft.md", "draft-module.md", "prd.md", "module.md", "plan.md", "results.md", "review.md"].includes(f)
        );
        artifacts = files;
        const category = classifyModuleStatus(moduleDir);
        status = category === "final" ? "ready" : category === "archived" ? "shipped" : "seed";
      } catch {
        // best-effort
      }

      moduleEntries.push({
        id: moduleId,
        stage: stageId,
        status,
        artifacts,
      });
    }

    stageEntries.push({
      id: stageId,
      name: stageName,
      hypothesis: meta.hypothesis,
      modules: moduleEntries,
      module_count: moduleEntries.length,
    });
  }

  return stageEntries;
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

      // Build stages from missions filesystem
      const stages = await buildStageEntries(alias);

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
        stages,
      });
    }

    return jsonResponse({ count: missions.length, missions });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

/**
 * List stages for a specific mission.
 */
export async function handleListStages(mission: string): Promise<Response> {
  try {
    const missionsRoot = getMissionsRoot();
    const missionDir = join(missionsRoot, mission);
    if (!existsSync(missionDir)) {
      return errorResponse(`Mission not found: ${mission}`, 404);
    }

    const stages = await buildStageEntries(mission);
    return jsonResponse({ mission, count: stages.length, stages });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

/**
 * List modules for a specific mission and stage.
 */
export async function handleListModules(mission: string, stage: string): Promise<Response> {
  try {
    const missionsRoot = getMissionsRoot();
    const stageDir = join(missionsRoot, mission, stage);
    if (!existsSync(stageDir)) {
      return errorResponse(`Stage not found: ${mission}/${stage}`, 404);
    }

    const moduleIds = listModules(mission, stage);
    const modules: ModuleEntry[] = [];

    for (const moduleId of moduleIds) {
      const moduleDir = resolveModulePath(mission, stage, moduleId);
      if (!existsSync(moduleDir)) continue;

      let status = "seed";
      let artifacts: string[] = [];
      try {
        const files = readdirSync(moduleDir).filter((f) =>
          ["draft.md", "draft-module.md", "prd.md", "module.md", "plan.md", "results.md", "review.md"].includes(f)
        );
        artifacts = files;
        const category = classifyModuleStatus(moduleDir);
        status = category === "final" ? "ready" : category === "archived" ? "shipped" : "seed";
      } catch {
        // best-effort
      }

      modules.push({ id: moduleId, stage, status, artifacts });
    }

    return jsonResponse({ mission, stage, count: modules.length, modules });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

/**
 * Get status for a specific module in the missions hierarchy.
 */
export async function handleGetMissionModuleStatus(
  mission: string,
  stage: string,
  module: string
): Promise<Response> {
  try {
    const moduleDir = resolveModulePath(mission, stage, module);
    if (!existsSync(moduleDir)) {
      return errorResponse(`Module not found: ${mission}/${stage}/${module}`, 404);
    }

    let status = "seed";
    let artifacts: string[] = [];
    try {
      const files = readdirSync(moduleDir).filter((f) =>
        ["draft.md", "prd.md", "plan.md", "results.md", "review.md"].includes(f)
      );
      artifacts = files;
      const category = classifyModuleStatus(moduleDir);
      status = category === "final" ? "ready" : category === "archived" ? "shipped" : "seed";
    } catch {
      // best-effort
    }

    return jsonResponse({ mission, stage, module, status, artifacts });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

/**
 * Get a specific document from a missions module.
 */
export async function handleGetMissionDocument(
  mission: string,
  stage: string,
  module: string,
  docType: string
): Promise<Response> {
  try {
    const moduleDir = resolveModulePath(mission, stage, module);
    if (!existsSync(moduleDir)) {
      return errorResponse(`Module not found: ${mission}/${stage}/${module}`, 404);
    }

    const filePath = join(moduleDir, docType);
    if (!existsSync(filePath)) {
      return errorResponse(
        `Document not found: ${mission}/${stage}/${module}/${docType}`,
        404
      );
    }

    const content = await readFile(filePath, "utf-8");
    return jsonResponse({ mission, stage, module, docType, content });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}
