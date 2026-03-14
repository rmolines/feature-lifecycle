import { DOCUMENT_TYPES, SCHEMAS } from "../schemas.js";
import {
  listProjects,
  listInitiatives,
  parseDocument,
  getInitiativesRoot,
  resolveInitiativePath,
} from "../parser.js";
import { deriveStatus } from "../tools/status.js";
import { existsSync, readdirSync } from "fs";
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
  type: string;
  data: Record<string, unknown>;
  valid: boolean;
  errors?: string[];
}

async function collectDocuments(opts: {
  type?: string;
  mission?: string;
}): Promise<DocumentEntry[]> {
  const root = getInitiativesRoot();
  const missions = opts.mission ? [opts.mission] : listProjects();
  const targetTypes = opts.type ? [opts.type] : DOCUMENT_TYPES;

  const entries: DocumentEntry[] = [];

  for (const mission of missions) {
    const modules = listInitiatives(mission);

    for (const module of modules) {
      const initDir = join(root, mission, module);
      if (!existsSync(initDir)) continue;

      const files = readdirSync(initDir).filter((f) => targetTypes.includes(f));

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
            errors,
          });
        } catch (err) {
          entries.push({
            path: filePath,
            mission,
            module,
            type: file,
            data: {},
            valid: false,
            errors: [String(err)],
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
