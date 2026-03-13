import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DOCUMENT_TYPES, SCHEMAS } from "../schemas.js";
import {
  listProjects,
  listInitiatives,
  parseDocument,
  getInitiativesRoot,
} from "../parser.js";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

interface DocumentEntry {
  path: string;
  project: string;
  initiative: string;
  type: string;
  data: Record<string, unknown>;
  valid: boolean;
  errors?: string[];
}

async function collectDocuments(opts: {
  type?: string;
  project?: string;
}): Promise<DocumentEntry[]> {
  const root = getInitiativesRoot();
  const projects = opts.project ? [opts.project] : listProjects();
  const targetTypes = opts.type ? [opts.type] : DOCUMENT_TYPES;

  const entries: DocumentEntry[] = [];

  for (const project of projects) {
    const initiatives = listInitiatives(project);

    for (const initiative of initiatives) {
      const initDir = join(root, project, initiative);
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
            project,
            initiative,
            type: file,
            data: parsed.data,
            valid,
            errors,
          });
        } catch (err) {
          entries.push({
            path: filePath,
            project,
            initiative,
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

export function register(server: McpServer): void {
  server.tool(
    "init_list",
    "Lists initiatives documents, optionally filtered by type and/or project",
    {
      type: z
        .string()
        .optional()
        .describe(
          `Document type filename to filter by (e.g. "draft.md", "prd.md"). Valid types: ${DOCUMENT_TYPES.join(", ")}`
        ),
      project: z
        .string()
        .optional()
        .describe("Project name to filter by (e.g. 'fl', 'akn')"),
    },
    async ({ type, project }) => {
      const documents = await collectDocuments({ type, project });

      const result = {
        count: documents.length,
        filters: { type: type ?? null, project: project ?? null },
        documents,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
