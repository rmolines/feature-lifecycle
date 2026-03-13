import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SCHEMAS, DOCUMENT_TYPES } from "../schemas.js";
import {
  getInitiativesRoot,
  parseDocument,
  serializeDocument,
} from "../parser.js";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { homedir } from "os";

function triggerReindex(): void {
  const script = join(homedir(), ".claude", "scripts", "workspace-reindex.sh");
  spawn("bash", [script], { detached: true, stdio: "ignore" }).unref();
}

function resolveDocPath(
  project: string,
  slug: string,
  file: string
): string {
  const root = getInitiativesRoot();
  return join(root, project, slug, file);
}

export function register(server: McpServer): void {
  // Tool 1: init_update_fields
  server.tool(
    "init_update_fields",
    "Merges new frontmatter fields into an existing initiative document, validates against schema, then writes back",
    {
      project: z.string().describe("Project slug (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
      file: z
        .string()
        .describe(
          `Document filename to update (e.g. "draft.md"). Valid types: ${DOCUMENT_TYPES.join(", ")}`
        ),
      fields: z
        .record(z.unknown())
        .describe("Fields to update. New values override existing; omitted fields are preserved."),
    },
    async ({ project, slug, file, fields }) => {
      const filePath = resolveDocPath(project, slug, file);

      // Check file exists
      if (!existsSync(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `File not found: ${filePath}`,
              }),
            },
          ],
        };
      }

      // Read existing document
      let parsed;
      try {
        parsed = await parseDocument(filePath);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Failed to read file: ${String(err)}`,
              }),
            },
          ],
        };
      }

      // Merge fields (new overrides old)
      const mergedFields = { ...parsed.data, ...fields };

      // Validate merged result against schema (if schema exists for this type)
      const schema = SCHEMAS[file];
      if (schema) {
        const validation = schema.safeParse(mergedFields);
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
                  error: "Frontmatter validation failed after merge",
                  field_errors: fieldErrors,
                }),
              },
            ],
          };
        }
      }

      // Determine which fields actually changed
      const updatedFields: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(fields)) {
        const prev = parsed.data[key];
        const next = (mergedFields as Record<string, unknown>)[key];
        if (JSON.stringify(prev) !== JSON.stringify(next)) {
          updatedFields[key] = { from: prev, to: next };
        }
      }

      // Serialize and write back (preserving body content)
      const serialized = serializeDocument(
        mergedFields as Record<string, unknown>,
        parsed.content
      );
      writeFileSync(filePath, serialized, "utf-8");

      // Trigger reindex
      triggerReindex();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              path: filePath,
              updatedFields,
            }),
          },
        ],
      };
    }
  );

  // Tool 2: init_update_section
  server.tool(
    "init_update_section",
    "Replaces the content of a specific markdown section (## Heading) in an initiative document",
    {
      project: z.string().describe("Project slug (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
      file: z.string().describe("Document filename (e.g. 'draft.md', 'prd.md')"),
      heading: z
        .string()
        .describe(
          "Section heading to replace (case-insensitive, without '## '). E.g. 'Problem'"
        ),
      content: z.string().describe("New content for the section (without the heading line itself)"),
    },
    async ({ project, slug, file, heading, content }) => {
      const filePath = resolveDocPath(project, slug, file);

      // Check file exists
      if (!existsSync(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `File not found: ${filePath}`,
              }),
            },
          ],
        };
      }

      // Read existing document
      let parsed;
      try {
        parsed = await parseDocument(filePath);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Failed to read file: ${String(err)}`,
              }),
            },
          ],
        };
      }

      const body = parsed.content;

      // Split body into sections by ## headings
      // Each "chunk" is either pre-first-heading text, or a heading + its content
      const headingRegex = /^(## .+)$/m;

      // Find all heading positions
      const headings: Array<{ heading: string; index: number }> = [];
      let match;
      const globalRegex = /^## (.+)$/gm;
      while ((match = globalRegex.exec(body)) !== null) {
        headings.push({ heading: match[1], index: match.index });
      }

      if (headings.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "No ## headings found in document",
                available_headings: [],
              }),
            },
          ],
        };
      }

      // Find matching heading (case-insensitive)
      const targetIdx = headings.findIndex(
        (h) => h.heading.toLowerCase() === heading.toLowerCase()
      );

      if (targetIdx === -1) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Heading "${heading}" not found`,
                available_headings: headings.map((h) => h.heading),
              }),
            },
          ],
        };
      }

      const targetHeading = headings[targetIdx];
      const nextHeading = headings[targetIdx + 1];

      // Determine the extent of the current section content
      const sectionStart = targetHeading.index;
      const sectionEnd = nextHeading ? nextHeading.index : body.length;

      // The section includes: "## Heading\n" + section body
      const headingLine = `## ${targetHeading.heading}`;
      const existingSectionContent = body.slice(
        sectionStart + headingLine.length,
        sectionEnd
      );

      // Build the new section
      const newSectionContent = content.startsWith("\n") ? content : "\n" + content;

      const newBody =
        body.slice(0, sectionStart) +
        headingLine +
        newSectionContent +
        (newSectionContent.endsWith("\n") ? "" : "\n") +
        (nextHeading ? "\n" : "") +
        body.slice(sectionEnd);

      // Serialize and write back (preserving frontmatter)
      const serialized = serializeDocument(
        parsed.data,
        newBody
      );
      writeFileSync(filePath, serialized, "utf-8");

      // Trigger reindex
      triggerReindex();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              path: filePath,
              heading: targetHeading.heading,
              previousLength: existingSectionContent.length,
              newLength: newSectionContent.length,
            }),
          },
        ],
      };
    }
  );
}
