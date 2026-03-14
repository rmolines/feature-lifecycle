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

export function register(server: McpServer): void {
  server.tool(
    "init_list",
    "Lists module documents, optionally filtered by type and/or mission",
    {
      type: z
        .string()
        .optional()
        .describe(
          `Document type filename to filter by (e.g. "draft.md", "prd.md"). Valid types: ${DOCUMENT_TYPES.join(", ")}`
        ),
      mission: z
        .string()
        .optional()
        .describe("Mission name to filter by (e.g. 'fl', 'akn')"),
    },
    async ({ type, mission }) => {
      const documents = await collectDocuments({ type, mission });

      const result = {
        count: documents.length,
        filters: { type: type ?? null, mission: mission ?? null },
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
