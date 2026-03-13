import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ReviewSchema } from "../schemas.js";
import { parseDocument, serializeDocument, getInitiativesRoot } from "../parser.js";
import { existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

export type InitiativeStatus =
  | "seed"
  | "exploring"
  | "ready"
  | "planned"
  | "building"
  | "done"
  | "approved"
  | "shipped";

export async function deriveStatus(
  project: string,
  slug: string
): Promise<{ status: InitiativeStatus; artifacts: string[] }> {
  const root = getInitiativesRoot();

  // Check archived first
  const archivedPath = join(root, project, "archived", slug);
  if (existsSync(archivedPath) && statSync(archivedPath).isDirectory()) {
    return { status: "shipped", artifacts: ["archived/" + slug] };
  }

  const dir = join(root, project, slug);
  if (!existsSync(dir)) {
    return { status: "seed", artifacts: [] };
  }

  const artifacts: string[] = [];

  // Collect artifacts
  const checkFile = (name: string): boolean => {
    const p = join(dir, name);
    if (existsSync(p)) {
      artifacts.push(name);
      return true;
    }
    return false;
  };

  const hasDraft = checkFile("draft.md");
  const hasPrd = checkFile("prd.md");
  const hasPlan = checkFile("plan.md");
  const hasResults = checkFile("results.md");
  const hasReview = checkFile("review.md");

  // Check cycles dir
  const cyclesDir = join(dir, "cycles");
  let hasCycles = false;
  if (existsSync(cyclesDir) && statSync(cyclesDir).isDirectory()) {
    const cycleFiles = readdirSync(cyclesDir).filter((f) => f.endsWith(".md"));
    if (cycleFiles.length > 0) {
      hasCycles = true;
      artifacts.push(...cycleFiles.map((f) => "cycles/" + f));
    }
  }

  // Derive status (highest wins)
  if (hasReview) {
    try {
      const doc = await parseDocument(join(dir, "review.md"));
      const parsed = ReviewSchema.safeParse(doc.data);
      if (parsed.success && parsed.data.decision === "approved") {
        return { status: "approved", artifacts };
      }
    } catch {
      // Fall through
    }
  }

  if (hasResults) {
    try {
      const doc = await parseDocument(join(dir, "results.md"));
      const content = doc.content;
      // Parse task lines: - [x] or - [ ]
      const taskLines = content.match(/^- \[[ xX]\]/gm) ?? [];
      const doneTasks = content.match(/^- \[[xX]\]/gm) ?? [];
      if (taskLines.length > 0 && doneTasks.length === taskLines.length) {
        return { status: "done", artifacts };
      }
    } catch {
      // Fall through
    }
    return { status: "building", artifacts };
  }

  if (hasPlan) {
    return { status: "planned", artifacts };
  }

  if (hasPrd) {
    return { status: "ready", artifacts };
  }

  if (hasCycles) {
    return { status: "exploring", artifacts };
  }

  return { status: "seed", artifacts };
}

/**
 * Writes derived status back to draft.md frontmatter as cache.
 * Only updates if draft.md exists and status actually changed.
 */
export async function updateStatusCache(
  project: string,
  slug: string
): Promise<void> {
  const root = getInitiativesRoot();
  const draftPath = join(root, project, slug, "draft.md");
  if (!existsSync(draftPath)) return;

  const { status } = await deriveStatus(project, slug);

  try {
    const doc = await parseDocument(draftPath);
    if (doc.data.status === status) return; // no change
    doc.data.status = status;
    const serialized = serializeDocument(doc.data, doc.content);
    writeFileSync(draftPath, serialized, "utf-8");
  } catch {
    // Best-effort cache — don't break the caller
  }
}

export function register(server: McpServer): void {
  server.tool(
    "init_get_status",
    "Derives the current lifecycle status of an initiative by inspecting filesystem artifacts",
    {
      project: z.string().describe("Project name (e.g. 'fl', 'akn')"),
      slug: z.string().describe("Initiative slug (e.g. 'query-layer')"),
    },
    async ({ project, slug }) => {
      const { status, artifacts } = await deriveStatus(project, slug);

      const result = {
        project,
        slug,
        status,
        artifacts,
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
