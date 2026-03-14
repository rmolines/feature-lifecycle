import matter from "gray-matter";
import { existsSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";

const INITIATIVES_PATH = join(homedir(), ".claude", "initiatives");
const DISCOVERIES_PATH = join(homedir(), ".claude", "discoveries");
const MISSIONS_PATH = join(homedir(), ".claude", "missions");

const EXCLUDED_DIRS = new Set(["_reviews", "archived"]);

export function getInitiativesRoot(): string {
  if (existsSync(INITIATIVES_PATH)) {
    return INITIATIVES_PATH;
  }
  return DISCOVERIES_PATH;
}

export interface ParsedDocument {
  data: Record<string, unknown>;
  content: string;
  path: string;
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);
  return {
    data: parsed.data as Record<string, unknown>,
    content: parsed.content,
    path: filePath,
  };
}

export function serializeDocument(
  data: Record<string, unknown>,
  content: string
): string {
  return matter.stringify(content, data);
}

export function listProjects(): string[] {
  const root = getInitiativesRoot();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root).filter((entry) => {
    if (EXCLUDED_DIRS.has(entry)) return false;
    const full = join(root, entry);
    return statSync(full).isDirectory();
  });
}

export function listInitiatives(project: string): string[] {
  const root = getInitiativesRoot();
  const projectDir = join(root, project);
  if (!existsSync(projectDir)) {
    return [];
  }
  return readdirSync(projectDir).filter((entry) => {
    const full = join(projectDir, entry);
    return statSync(full).isDirectory();
  });
}

export function resolveInitiativePath(project: string, initiative: string): string {
  const root = getInitiativesRoot();
  return join(root, project, initiative);
}

// ─── Missions (3-level: mission / stage / module) ───────────────────────────

export function getMissionsRoot(): string {
  if (existsSync(MISSIONS_PATH)) return MISSIONS_PATH;
  return getInitiativesRoot();
}

/**
 * List stages for a mission from ~/.claude/missions/<mission>/
 * Returns directory names, treating _backlog as the special backlog stage.
 */
export function listStages(mission: string): string[] {
  const root = getMissionsRoot();
  const missionDir = join(root, mission);
  if (!existsSync(missionDir)) return [];
  return readdirSync(missionDir).filter((entry) => {
    if (EXCLUDED_DIRS.has(entry)) return false;
    const full = join(missionDir, entry);
    return statSync(full).isDirectory();
  });
}

/**
 * List modules for a given mission and stage.
 */
export function listModules(mission: string, stage: string): string[] {
  const root = getMissionsRoot();
  const stageDir = join(root, mission, stage);
  if (!existsSync(stageDir)) return [];
  return readdirSync(stageDir).filter((entry) => {
    if (EXCLUDED_DIRS.has(entry)) return false;
    const full = join(stageDir, entry);
    return statSync(full).isDirectory();
  });
}

/**
 * Resolve full path to a module directory.
 */
export function resolveModulePath(mission: string, stage: string, module: string): string {
  const root = getMissionsRoot();
  return join(root, mission, stage, module);
}
