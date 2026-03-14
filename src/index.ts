import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startHttpServer } from "./server.js";
import * as readMeTool from "./tools/read-me.js";
import * as listTool from "./tools/list.js";
import * as createTool from "./tools/create.js";
import * as updateTool from "./tools/update.js";
import * as statusTool from "./tools/status.js";
import * as lifecycleTool from "./tools/lifecycle.js";

const server = new McpServer({
  name: "initiatives",
  version: "0.1.0",
});

startHttpServer(Number(process.env.WORKSPACE_PORT) || 3333);

// Register all tools — add new tool files here
readMeTool.register(server);
listTool.register(server);
createTool.register(server);
updateTool.register(server);
statusTool.register(server);
lifecycleTool.register(server);

const transport = new StdioServerTransport();
await server.connect(transport);
