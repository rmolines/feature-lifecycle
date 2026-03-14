import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SCHEMAS, DOCUMENT_TYPES } from "../schemas.js";
import { listProjects, listInitiatives, getInitiativesRoot } from "../parser.js";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

function buildSchemaSummary(): Record<string, { required: string[]; optional: string[] }> {
  const summary: Record<string, { required: string[]; optional: string[] }> = {};

  for (const [docType, schema] of Object.entries(SCHEMAS)) {
    const shape = schema.shape;
    const required: string[] = [];
    const optional: string[] = [];

    for (const [key, def] of Object.entries(shape)) {
      const isOptional =
        def instanceof Object &&
        "_def" in def &&
        (def._def as { typeName?: string }).typeName === "ZodOptional";
      if (isOptional) {
        optional.push(key);
      } else {
        required.push(key);
      }
    }

    summary[docType] = { required, optional };
  }

  return summary;
}

function buildPortfolioStats(): Record<string, { modules: number; documents: Record<string, number> }> {
  const root = getInitiativesRoot();
  const missions = listProjects();
  const stats: Record<string, { modules: number; documents: Record<string, number> }> = {};

  for (const mission of missions) {
    const modules = listInitiatives(mission);
    const docCounts: Record<string, number> = {};

    for (const module of modules) {
      const initDir = join(root, mission, module);
      if (!existsSync(initDir)) continue;

      const files = readdirSync(initDir).filter((f) => DOCUMENT_TYPES.includes(f));
      for (const file of files) {
        docCounts[file] = (docCounts[file] ?? 0) + 1;
      }
    }

    stats[mission] = {
      modules: modules.length,
      documents: docCounts,
    };
  }

  return stats;
}

export function register(server: McpServer): void {
  server.tool(
    "init_read_me",
    "Returns schema summary, available tools, and portfolio state for the initiatives database",
    {},
    async () => {
      const schemaSummary = buildSchemaSummary();
      const portfolioStats = buildPortfolioStats();

      const tools = [
        {
          name: "init_read_me",
          description: "Returns schema summary, available tools, and portfolio state",
          parameters: "none",
        },
        {
          name: "init_list",
          description: "Lists module documents with optional filtering",
          parameters: "type (optional): document type filename; mission (optional): mission name",
        },
        {
          name: "init_create",
          description: "Creates a new module document with Zod-validated frontmatter",
          parameters: "type, mission, module (optional for mission.md), fields, content (optional)",
        },
        {
          name: "init_update_fields",
          description: "Merges new frontmatter fields into an existing document, validates against schema",
          parameters: "mission, module, file, fields",
        },
        {
          name: "init_update_section",
          description: "Replaces the content of a specific ## Heading section",
          parameters: "mission, module, file, heading, content",
        },
        {
          name: "init_get_status",
          description: "Derives lifecycle status from filesystem artifacts",
          parameters: "mission, module",
        },
        {
          name: "init_finalize",
          description: "Promotes draft to ready by creating prd.md with valid frontmatter from draft.md",
          parameters: "mission, module",
        },
        {
          name: "init_archive",
          description: "Archives a module by moving it to {mission}/archived/{module}/",
          parameters: "mission, module",
        },
        {
          name: "init_validate",
          description: "Validates a document's frontmatter against its schema without modifying",
          parameters: "mission, module, file",
        },
        {
          name: "init_add_cycle",
          description: "Adds a new cycle document to a module's cycles/ directory",
          parameters: "mission, module, type, description, content (optional)",
        },
      ];

      const result = {
        schema_summary: schemaSummary,
        document_types: DOCUMENT_TYPES,
        available_tools: tools,
        portfolio: portfolioStats,
        initiatives_root: getInitiativesRoot(),
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
