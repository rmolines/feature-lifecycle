import matter from "gray-matter";
import { existsSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";

const INITIATIVES_PATH = join(homedir(), ".claude", "initiatives");
const DISCOVERIES_PATH = join(homedir(), ".claude", "discoveries");

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
