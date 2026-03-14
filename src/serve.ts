import { startHttpServer } from "./server.js";

const port = Number(process.env.WORKSPACE_PORT) || 3333;
startHttpServer(port);
