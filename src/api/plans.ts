import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { getInitiativesRoot } from "../parser.js";

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

interface Task {
  task: string;
  title: string;
  depends_on: string;
  executor: string;
  isolation: string;
  batch: number;
  files: string;
  requirements: string;
  max_retries: number;
  acceptance: string;
}

interface TaskResult {
  task: string;
  status: string;
  summary: string;
  files_changed: string;
  errors: string;
  validation_result: string;
}

interface Requirement {
  id: string;
  text: string;
}

interface PlanResponse {
  tasks: Task[];
  results: TaskResult[];
  requirements: Requirement[];
}

/**
 * Extract section content between "## <header>" and the next "## " or end of file.
 */
function extractSection(content: string, header: string): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === `## ${header}`) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) {
      break;
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n");
}

/**
 * Parse task blocks from the Execution DAG section.
 * Each block is a sequence of key: value lines separated by blank lines.
 */
function parseTasks(dagText: string): Task[] {
  const tasks: Task[] = [];
  const blocks = dagText.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    // Check if this block has a task: field
    const hasTask = lines.some((l) => /^task:\s/.test(l));
    if (!hasTask) continue;

    // Skip code fences and comments
    if (lines.some((l) => l.trim().startsWith("```") || l.trim().startsWith("<!--"))) continue;

    const task: Task = {
      task: "",
      title: "",
      depends_on: "",
      executor: "",
      isolation: "",
      batch: 0,
      files: "",
      requirements: "",
      max_retries: 0,
      acceptance: "",
    };

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)/);
      if (!match) continue;
      const [, key, val] = match;
      switch (key) {
        case "task": task.task = val.trim(); break;
        case "title": task.title = val.trim(); break;
        case "depends_on": task.depends_on = val.trim(); break;
        case "executor": task.executor = val.trim(); break;
        case "isolation": task.isolation = val.trim(); break;
        case "batch": task.batch = parseInt(val.trim(), 10) || 0; break;
        case "files": task.files = val.trim(); break;
        case "requirements": task.requirements = val.trim(); break;
        case "max_retries": task.max_retries = parseInt(val.trim(), 10) || 0; break;
        case "acceptance": task.acceptance = val.trim(); break;
      }
    }

    if (task.task) {
      if (!task.title) task.title = task.task;
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Parse results blocks from results.md content.
 */
function parseResults(content: string): TaskResult[] {
  const results: TaskResult[] = [];
  const blocks = content.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    const hasTask = lines.some((l) => /^task:\s/.test(l));
    if (!hasTask) continue;

    const result: TaskResult = {
      task: "",
      status: "",
      summary: "",
      files_changed: "",
      errors: "",
      validation_result: "",
    };

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)/);
      if (!match) continue;
      const [, key, val] = match;
      switch (key) {
        case "task": result.task = val.trim(); break;
        case "status": result.status = val.trim(); break;
        case "summary": result.summary = val.trim(); break;
        case "files_changed": result.files_changed = val.trim(); break;
        case "errors": result.errors = val.trim(); break;
        case "validation_result": result.validation_result = val.trim(); break;
      }
    }

    if (result.task) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Parse requirements from the ## Requirements section.
 * Matches lines: - **R<N>:** <text>
 */
function parseRequirements(reqText: string): Requirement[] {
  const requirements: Requirement[] = [];
  const lines = reqText.split("\n");

  for (const line of lines) {
    const match = line.match(/^- \*\*(R\d+):\*\*\s+(.+)$/);
    if (match) {
      requirements.push({ id: match[1], text: match[2].trim() });
    }
  }

  return requirements;
}

export async function handleGetPlan(mission: string, module: string): Promise<Response> {
  try {
    const root = getInitiativesRoot();
    const moduleDir = join(root, mission, module);

    if (!existsSync(moduleDir)) {
      return errorResponse(`Module not found: ${mission}/${module}`, 404);
    }

    const planPath = join(moduleDir, "plan.md");
    if (!existsSync(planPath)) {
      return errorResponse(`plan.md not found for: ${mission}/${module}`, 404);
    }

    let planContent: string;
    try {
      planContent = await readFile(planPath, "utf-8");
    } catch (err) {
      return errorResponse(`Failed to read plan.md: ${String(err)}`, 500);
    }

    const dagSection = extractSection(planContent, "Execution DAG");
    const reqSection = extractSection(planContent, "Requirements");

    const tasks = parseTasks(dagSection);
    const requirements = parseRequirements(reqSection);

    let taskResults: TaskResult[] = [];
    const resultsPath = join(moduleDir, "results.md");
    if (existsSync(resultsPath)) {
      try {
        const resultsContent = await readFile(resultsPath, "utf-8");
        taskResults = parseResults(resultsContent);
      } catch {
        // Best-effort — return empty results if parse fails
      }
    }

    const response: PlanResponse = {
      tasks,
      results: taskResults,
      requirements,
    };

    return jsonResponse(response);
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}
