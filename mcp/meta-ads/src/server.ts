import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config.js";
import { MetaClient } from "./meta-client.js";
import { registerTools } from "./tools.js";

/** Build a fully wired MCP server instance (config + client + tools). */
export function buildServer(): McpServer {
  const cfg = loadConfig();
  const client = new MetaClient(cfg);
  const server = new McpServer({ name: "np7-meta-ads", version: "0.1.0" });
  registerTools(server, client);
  return server;
}
