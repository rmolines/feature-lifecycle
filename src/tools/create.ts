import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SCHEMAS, DOCUMENT_TYPES } from "../schemas.js";
import { getInitiativesRoot, serializeDocument } from "../parser.js";
import { updateStatusCache } from "./status.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { homedir } from "os";

function triggerReindex(): void {
  const script = join(homedir(), ".claude", "scripts", "workspace-reindex.sh");
  spawn("bash", [script], { detached: true, stdio: "ignore" }).unref();
}

export function register(server: McpServer): void {
  server.tool(
    "init_create",
    "Creates a new initiative document (draft.md, prd.md, vision.md, etc.) with Zod-validated frontmatter",
    {
      type: z
        .string()
        .describe(
          `Document type to create. Valid types: ${DOCUMENT_TYPES.join(", ")}`
        ),
      mission: z.string().describe("Mission slug (e.g. 'fl', 'akn')"),
      module: z
        .string()
        .optional()
        .describe(
          "Module slug (e.g. 'query-layer'). Not required for mission.md"
        ),
      fields: z
        .record(z.unknown())
        .describe("Frontmatter fields to set. Must match the schema for the document type."),
      content: z
        .string()
        .optional()
        .describe("Optional markdown body content"),
    },
    async ({ type, mission, module, fields, content }) => {
      // 1. Validate document type
      if (!DOCUMENT_TYPES.includes(type)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Unknown document type: "${type}". Valid types: ${DOCUMENT_TYPES.join(", ")}`,
              }),
            },
          ],
        };
      }

      // 2. Look up schema and validate fields
      const schema = SCHEMAS[type];
      const validation = schema.safeParse(fields);

      if (!validation.success) {
        const fieldErrors = validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Frontmatter validation failed",
                field_errors: fieldErrors,
              }),
            },
          ],
        };
      }

      // 3. Build directory and file path
      const root = getInitiativesRoot();
      let dir: string;
      if (type === "mission.md") {
        dir = join(root, mission);
      } else {
        if (!module) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: `"module" is required for document type "${type}"`,
                }),
              },
            ],
          };
        }
        dir = join(root, mission, module);
      }

      const filePath = join(dir, type);

      // 4. Check file doesn't already exist
      if (existsSync(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `File already exists: ${filePath}`,
              }),
            },
          ],
        };
      }

      // 5. Create directory if needed
      mkdirSync(dir, { recursive: true });

      // 6. Serialize and write
      const serialized = serializeDocument(
        validation.data as Record<string, unknown>,
        content ?? ""
      );
      writeFileSync(filePath, serialized, "utf-8");

      // 7. Update status cache + trigger reindex
      if (module) {
        await updateStatusCache(mission, module);
      }
      triggerReindex();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              path: filePath,
              fields: validation.data,
            }),
          },
        ],
      };
    }
  );
}
