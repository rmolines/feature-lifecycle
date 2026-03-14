import type { ServerWebSocket } from "bun";
import path from "path";
import {
  handleList,
  handleGetStatus,
  handleGetDocument,
} from "./api/initiatives.js";
import { startWatcher } from "./watcher.js";

const startTime = Date.now();
const clients = new Set<ServerWebSocket<unknown>>();

// Project root is one level up from src/
const projectRoot = path.resolve(import.meta.dir, "..");

export function broadcast(data: object): void {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    ws.send(payload);
  }
}

export function startHttpServer(port: number): ReturnType<typeof Bun.serve> {
  const httpServer = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // WebSocket upgrade
      if (pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (upgraded) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // API: GET /api/initiatives (with optional ?type=&project= params)
      if (req.method === "GET" && pathname === "/api/initiatives") {
        const type = url.searchParams.get("type") ?? undefined;
        const project = url.searchParams.get("project") ?? undefined;
        return handleList({ type, project });
      }

      // API: GET /api/initiatives/:project/:slug/status
      // API: GET /api/initiatives/:project/:slug/:docType
      if (req.method === "GET" && pathname.startsWith("/api/initiatives/")) {
        const segments = pathname.slice("/api/initiatives/".length).split("/");
        if (segments.length === 3) {
          const [project, slug, last] = segments;
          if (last === "status") {
            return handleGetStatus(project, slug);
          }
          // docType like "draft.md", "prd.md", etc.
          return handleGetDocument(project, slug, last);
        }
        return new Response("Not Found", { status: 404 });
      }

      // Health endpoint
      if (req.method === "GET" && pathname === "/api/health") {
        return new Response(
          JSON.stringify({ status: "ok", uptime_ms: Date.now() - startTime }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // Static files under /views/shared/
      if (req.method === "GET" && pathname.startsWith("/views/shared/")) {
        const relativePath = pathname.slice("/views/shared/".length);
        const filePath = path.join(projectRoot, "views", "shared", relativePath);
        const file = Bun.file(filePath);
        return file.exists().then((exists) => {
          if (!exists) return new Response("Not Found", { status: 404 });
          return new Response(file);
        });
      }

      // File-based routing: GET /<name> → views/<name>.html
      if (req.method === "GET") {
        const name = pathname.slice(1); // strip leading /
        if (name && !name.includes("/")) {
          const filePath = path.join(projectRoot, "views", `${name}.html`);
          const file = Bun.file(filePath);
          return file.exists().then((exists) => {
            if (!exists) return new Response("Not Found", { status: 404 });
            return new Response(file, {
              headers: { "Content-Type": "text/html" },
            });
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    },

    websocket: {
      open(ws) {
        clients.add(ws);
        process.stderr.write(`[workspace] WS client connected (total: ${clients.size})\n`);
      },
      close(ws) {
        clients.delete(ws);
        process.stderr.write(`[workspace] WS client disconnected (total: ${clients.size})\n`);
      },
      message(ws, message) {
        process.stderr.write(`[workspace] WS message: ${message}\n`);
      },
    },
  });

  process.stderr.write(`[workspace] HTTP server on http://localhost:${port}\n`);

  startWatcher((changedPath) => broadcast({ type: "refresh", path: changedPath }));

  return httpServer;
}
