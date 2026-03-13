import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CycleSchema, DraftSchema, PrdSchema, SCHEMAS } from "../schemas.js";
import {
  parseDocument,
  serializeDocument,
  getInitiativesRoot,
} from "../parser.js";
import { updateStatusCache } from "./status.js";
import {
  existsSync,
  readdirSync,
  mkdirSync,
  renameSync,
  statSync,
} from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { homedir } from "os";

function triggerReindex(): void {
  const script = join(homedir(), ".claude", "scripts", "workspace-reindex.sh");
  if (!existsSync(script)) return;
  const child = spawn("bash", [script], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function register(server: McpServer): void {
  // ── init_finalize ───────────────────────────────────────────────────────────
  server.tool(
    "init_finalize",
    "Promotes a draft initiative to 'ready' by creating prd.md with valid frontmatter derived from draft.md",
    {
      project: z.string().describe("Project name (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
    },
    async ({ project, slug }) => {
      const root = getInitiativesRoot();
      const dir = join(root, project, slug);
      const draftPath = join(dir, "draft.md");
      const prdPath = join(dir, "prd.md");

      if (!existsSync(draftPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `draft.md not found at ${draftPath}`,
              }),
            },
          ],
        };
      }

      const draft = await parseDocument(draftPath);
      const draftValidation = DraftSchema.safeParse(draft.data);

      if (!draftValidation.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "draft.md frontmatter is invalid",
                errors: draftValidation.error.issues.map(
                  (i) => `${i.path.join(".")}: ${i.message}`
                ),
              }),
            },
          ],
        };
      }

      const draftData = draftValidation.data;

      const prdData = {
        id: draftData.id,
        project: draftData.project,
        created: draftData.created,
        updated: today(),
        tags: draftData.tags ?? [],
      };

      const prdValidation = PrdSchema.safeParse(prdData);
      if (!prdValidation.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "prd.md frontmatter validation failed",
                errors: prdValidation.error.issues.map(
                  (i) => `${i.path.join(".")}: ${i.message}`
                ),
              }),
            },
          ],
        };
      }

      const prdContent = serializeDocument(
        prdData,
        "\n<!-- Fill in PRD content using init_update_section -->\n"
      );

      await writeFile(prdPath, prdContent, "utf-8");
      await updateStatusCache(project, slug);
      triggerReindex();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              path: prdPath,
              frontmatter: prdData,
              message:
                "prd.md created with valid frontmatter. Use init_update_section to fill content.",
            }),
          },
        ],
      };
    }
  );

  // ── init_archive ────────────────────────────────────────────────────────────
  server.tool(
    "init_archive",
    "Archives an initiative by moving it to {project}/archived/{slug}/",
    {
      project: z.string().describe("Project name (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
    },
    async ({ project, slug }) => {
      const root = getInitiativesRoot();
      const srcPath = join(root, project, slug);
      const archivedDir = join(root, project, "archived");
      const destPath = join(archivedDir, slug);

      if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Initiative directory not found: ${srcPath}`,
              }),
            },
          ],
        };
      }

      if (existsSync(destPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Already archived at ${destPath}`,
              }),
            },
          ],
        };
      }

      if (!existsSync(archivedDir)) {
        mkdirSync(archivedDir, { recursive: true });
      }

      renameSync(srcPath, destPath);
      triggerReindex();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              from: srcPath,
              to: destPath,
              status: "shipped",
            }),
          },
        ],
      };
    }
  );

  // ── init_add_cycle ──────────────────────────────────────────────────────────
  server.tool(
    "init_add_cycle",
    "Adds a new cycle document to an initiative's cycles/ directory",
    {
      project: z.string().describe("Project name (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
      type: z
        .enum(["framing", "research", "analysis", "spike", "mockup", "interview"])
        .describe("Cycle type"),
      description: z
        .string()
        .describe("Short description used in the filename (will be kebab-cased)"),
      content: z
        .string()
        .optional()
        .describe("Markdown body content for the cycle file"),
    },
    async ({ project, slug, type, description, content }) => {
      const root = getInitiativesRoot();
      const dir = join(root, project, slug);

      if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Initiative directory not found: ${dir}`,
              }),
            },
          ],
        };
      }

      const cyclesDir = join(dir, "cycles");
      if (!existsSync(cyclesDir)) {
        mkdirSync(cyclesDir, { recursive: true });
      }

      // Count existing cycles to determine next number
      const existing = readdirSync(cyclesDir).filter((f) =>
        f.endsWith(".md")
      );
      const nn = String(existing.length + 1).padStart(2, "0");

      const kebabDesc = toKebab(description);
      const filename = `${nn}-${type}-${kebabDesc}.md`;
      const filePath = join(cyclesDir, filename);

      const cycleData: Record<string, unknown> = {
        type,
        date: today(),
        initiative: slug,
      };

      const cycleValidation = CycleSchema.safeParse(cycleData);
      if (!cycleValidation.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Cycle frontmatter validation failed",
                errors: cycleValidation.error.issues.map(
                  (i) => `${i.path.join(".")}: ${i.message}`
                ),
              }),
            },
          ],
        };
      }

      const fileContent = serializeDocument(cycleData, content ? `\n${content}\n` : "\n");
      await writeFile(filePath, fileContent, "utf-8");
      await updateStatusCache(project, slug);
      triggerReindex();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              path: filePath,
              filename,
              frontmatter: cycleData,
            }),
          },
        ],
      };
    }
  );

  // ── init_validate ───────────────────────────────────────────────────────────
  server.tool(
    "init_validate",
    "Validates a document's frontmatter against its schema without modifying it",
    {
      project: z.string().describe("Project name (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
      file: z
        .string()
        .describe(
          "Filename to validate (e.g. 'draft.md', 'prd.md', 'review.md')"
        ),
    },
    async ({ project, slug, file }) => {
      const root = getInitiativesRoot();
      const filePath = join(root, project, slug, file);

      if (!existsSync(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: false,
                errors: [`File not found: ${filePath}`],
                fields: null,
              }),
            },
          ],
        };
      }

      let parsed;
      try {
        parsed = await parseDocument(filePath);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: false,
                errors: [`Failed to parse file: ${String(err)}`],
                fields: null,
              }),
            },
          ],
        };
      }

      const schema = SCHEMAS[file];
      if (!schema) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: null,
                errors: [`No schema registered for '${file}'`],
                fields: parsed.data,
              }),
            },
          ],
        };
      }

      const result = schema.safeParse(parsed.data);

      if (result.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: true,
                errors: null,
                fields: result.data,
              }),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: false,
                errors: result.error.issues.map(
                  (i) => `${i.path.join(".")}: ${i.message}`
                ),
                fields: parsed.data,
              }),
            },
          ],
        };
      }
    }
  );
}
