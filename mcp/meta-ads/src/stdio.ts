#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { MetaClient } from "./meta-client.js";
import { buildServer } from "./server.js";

/**
 * `--doctor`: validate credentials by reading the ad account, then exit.
 * Prints to stderr only (stdout is reserved for the MCP protocol stream).
 */
async function doctor(): Promise<void> {
  const client = new MetaClient(loadConfig());
  const info = await client.get(client.account, {
    fields: "name,account_status,currency,timezone_name",
  });
  console.error("✓ Credentials OK. Ad account:", JSON.stringify(info));
}

async function main(): Promise<void> {
  if (process.argv.includes("--doctor")) {
    await doctor();
    return;
  }
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  console.error("np7-meta-ads MCP server running on stdio.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
