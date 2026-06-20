#!/usr/bin/env node
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";

/**
 * Remote (Streamable HTTP) transport for the Meta Ads MCP server.
 *
 * Stateless: a fresh server + transport is created per request. Every request
 * must carry `Authorization: Bearer <MCP_BEARER_TOKEN>`. The server refuses to
 * start without a bearer token so an ads-management endpoint is never left open.
 */
const PORT = Number(process.env.PORT ?? 8787);
const BEARER = process.env.MCP_BEARER_TOKEN?.trim();
const PATH = "/mcp";

if (!BEARER) {
  console.error(
    "Refusing to start: MCP_BEARER_TOKEN is not set. An open Meta ads endpoint is dangerous.\n" +
      "Set MCP_BEARER_TOKEN to a long random secret and restart.",
  );
  process.exit(1);
}

function send(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

const httpServer = http.createServer(async (req, res) => {
  if ((req.url ?? "").split("?")[0].replace(/\/$/, "") !== PATH) {
    send(res, 404, { error: "not_found" });
    return;
  }

  if (req.headers["authorization"] !== `Bearer ${BEARER}`) {
    send(res, 401, { error: "unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json", allow: "POST" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed (stateless server — POST only)." },
        id: null,
      }),
    );
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");

  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    return;
  }

  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    if (!res.headersSent) {
      send(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: (err as Error)?.message ?? "Internal error" },
        id: null,
      });
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`np7-meta-ads MCP server (HTTP) listening on :${PORT}${PATH}`);
});
