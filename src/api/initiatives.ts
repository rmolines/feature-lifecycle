import { DOCUMENT_TYPES, SCHEMAS } from "../schemas.js";
import {
  listProjects,
  listInitiatives,
  parseDocument,
  getInitiativesRoot,
  resolveInitiativePath,
  getMissionsRoot,
  listStages,
  listModules,
  resolveModulePath,
} from "../parser.js";
import { deriveStatus } from "../tools/status.js";
import { existsSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

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

interface DocumentEntry {
  path: string;
  mission: string;
  module: string;
  stage?: string;
  type: string;
  data: Record<string, unknown>;
  valid: boolean;
  errors?: string[];
}

/**
 * Count tasks by status in results.md content.
 * Parses key-value blocks matching: status: success|partial|failed
 */
function parseResultsSummary(content: string): string {
  const statusLines = content.match(/^status:\s*\S+/gm) ?? [];
  const total = statusLines.length;
  const success = statusLines.filter((l) => /^status:\s*success$/.test(l)).length;
  const partial = statusLines.filter((l) => /^status:\s*partial$/.test(l)).length;
  const failed = statusLines.filter((l) => /^status:\s*failed$/.test(l)).length;
  return `${success} success, ${partial} partial, ${failed} failed of ${total} tasks`;
}

/**
 * Extract decision: field from review.md content (first matching line).
 */
function parseReviewDecision(content: string): string | null {
  const match = content.match(/^decision:\s*(.+)$/m);
  return (match && match[1] !== undefined) ? match[1].trim() : null;
}

/**
 * Enrich a document entry's module directory with extra fields.
 */
async function enrichModuleData(initDir: string): Promise<{
  results_summary: string | null;
  review_decision: string | null;
  cycle_count: number;
  problem: string | null;
}> {
  let results_summary: string | null = null;
  let review_decision: string | null = null;
  let cycle_count = 0;
  let problem: string | null = null;

  // results_summary
  const resultsPath = join(initDir, "results.md");
  if (existsSync(resultsPath)) {
    try {
      const content = await readFile(resultsPath, "utf-8");
      results_summary = parseResultsSummary(content);
    } catch {
      // best-effort
    }
  }

  // review_decision — from frontmatter in review.md
  const reviewPath = join(initDir, "review.md");
  if (existsSync(reviewPath)) {
    try {
      const content = await readFile(reviewPath, "utf-8");
      review_decision = parseReviewDecision(content);
    } catch {
      // best-effort
    }
  }

  // cycle_count
  const cyclesDir = join(initDir, "cycles");
  if (existsSync(cyclesDir) && statSync(cyclesDir).isDirectory()) {
    try {
      cycle_count = readdirSync(cyclesDir).length;
    } catch {
      // best-effort
    }
  }

  // problem — first sentence from ## Problem in prd.md > draft.md
  const primaryDoc = existsSync(join(initDir, "prd.md"))
    ? join(initDir, "prd.md")
    : existsSync(join(initDir, "draft.md"))
    ? join(initDir, "draft.md")
    : null;

  if (primaryDoc) {
    try {
      const content = await readFile(primaryDoc, "utf-8");
      const lines = content.split("\n");
      let inProblem = false;
      for (const line of lines) {
        if (/^## Problem/.test(line)) {
          inProblem = true;
          continue;
        }
        if (inProblem && /^## /.test(line)) break;
        if (inProblem && line.trim() !== "") {
          problem = line.trim();
          break;
        }
      }
    } catch {
      // best-effort
    }
  }

  return { results_summary, review_decision, cycle_count, problem };
}

async function collectDocuments(opts: {
  type?: string;
  mission?: string;
}): Promise<(DocumentEntry & {
  results_summary: string | null;
  review_decision: string | null;
  cycle_count: number;
  problem: string | null;
})[]> {
  const root = getInitiativesRoot();
  const missions = opts.mission ? [opts.mission] : listProjects();
  const targetTypes = opts.type ? [opts.type] : DOCUMENT_TYPES;

  type EnrichedEntry = DocumentEntry & {
    results_summary: string | null;
    review_decision: string | null;
    cycle_count: number;
    problem: string | null;
  };

  const entries: EnrichedEntry[] = [];
  // Cache enrichment per module dir to avoid re-reading files
  const enrichmentCache = new Map<string, Awaited<ReturnType<typeof enrichModuleData>>>();

  for (const mission of missions) {
    const modules = listInitiatives(mission);

    for (const module of modules) {
      const initDir = join(root, mission, module);
      if (!existsSync(initDir)) continue;

      const files = readdirSync(initDir).filter((f) => targetTypes.includes(f));

      // Compute enrichment once per module
      if (!enrichmentCache.has(initDir)) {
        enrichmentCache.set(initDir, await enrichModuleData(initDir));
      }
      const enrichment = enrichmentCache.get(initDir)!;

      for (const file of files) {
        const filePath = join(initDir, file);
        try {
          const parsed = await parseDocument(filePath);
          const schema = SCHEMAS[file];
          let valid = true;
          let errors: string[] | undefined;

          if (schema) {
            const result = schema.safeParse(parsed.data);
            if (!result.success) {
              valid = false;
              errors = result.error.issues.map(
                (i) => `${i.path.join(".")}: ${i.message}`
              );
            }
          }

          entries.push({
            path: filePath,
            mission,
            module,
            type: file,
            data: parsed.data,
            valid,
            ...(errors !== undefined ? { errors } : {}),
            ...enrichment,
          } as EnrichedEntry);
        } catch (err) {
          entries.push({
            path: filePath,
            mission,
            module,
            type: file,
            data: {},
            valid: false,
            errors: [String(err)],
            ...enrichment,
          });
        }
      }
    }
  }

  return entries;
}

export async function handleList(params: {
  type?: string;
  mission?: string;
}): Promise<Response> {
  try {
    const documents = await collectDocuments(params);
    return jsonResponse({
      count: documents.length,
      filters: { type: params.type ?? null, mission: params.mission ?? null },
      documents,
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

export async function handleGetStatus(
  mission: string,
  slug: string
): Promise<Response> {
  try {
    const { status, artifacts } = await deriveStatus(mission, slug);
    return jsonResponse({ mission, slug, status, artifacts });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

export async function handleGetDocument(
  mission: string,
  slug: string,
  docType: string
): Promise<Response> {
  try {
    const initDir = resolveInitiativePath(mission, slug);
    if (!existsSync(initDir)) {
      return errorResponse(`Initiative not found: ${mission}/${slug}`, 404);
    }

    const filePath = join(initDir, docType);
    if (!existsSync(filePath)) {
      return errorResponse(
        `Document not found: ${mission}/${slug}/${docType}`,
        404
      );
    }

    const parsed = await parseDocument(filePath);
    return jsonResponse({ data: parsed.data, content: parsed.content });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

// ─── 3-level handlers (mission / stage / module) ─────────────────────────────

export async function handleGetStage(
  mission: string,
  stage: string
): Promise<Response> {
  try {
    const root = getMissionsRoot();
    const stageDir = join(root, mission, stage);
    if (!existsSync(stageDir)) {
      return errorResponse(`Stage not found: ${mission}/${stage}`, 404);
    }

    const moduleIds = listModules(mission, stage);
    return jsonResponse({ mission, stage, modules: moduleIds });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

export async function handleGetStatus3(
  mission: string,
  stage: string,
  module: string
): Promise<Response> {
  try {
    const moduleDir = resolveModulePath(mission, stage, module);
    if (!existsSync(moduleDir)) {
      return errorResponse(`Module not found: ${mission}/${stage}/${module}`, 404);
    }

    const artifacts: string[] = [];
    const docFiles = ["draft.md", "draft-module.md", "prd.md", "module.md", "plan.md", "results.md", "review.md"];
    for (const f of docFiles) {
      if (existsSync(join(moduleDir, f))) artifacts.push(f);
    }

    let status = "seed";
    if (existsSync(join(moduleDir, "review.md"))) status = "approved";
    else if (existsSync(join(moduleDir, "results.md"))) status = "building";
    else if (existsSync(join(moduleDir, "plan.md"))) status = "planned";
    else if (existsSync(join(moduleDir, "prd.md")) || existsSync(join(moduleDir, "module.md"))) status = "ready";
    else if (existsSync(join(moduleDir, "draft.md")) || existsSync(join(moduleDir, "draft-module.md"))) status = "exploring";

    return jsonResponse({ mission, stage, module, status, artifacts });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}

export async function handleGetDocument3(
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

    const parsed = await parseDocument(filePath);
    return jsonResponse({ data: parsed.data, content: parsed.content });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}
