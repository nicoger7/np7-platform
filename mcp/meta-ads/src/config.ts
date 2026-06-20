import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runtime configuration for the Meta Ads MCP server.
 *
 * Credentials are read from the environment. For local use you can drop a
 * `.env` file next to this package (see `.env.example`); it is parsed here with
 * a tiny dependency-free loader so we don't pull in `dotenv`.
 */
export interface MetaConfig {
  appId?: string;
  appSecret?: string;
  accessToken: string;
  /** Always normalized to the `act_<id>` form. */
  adAccountId: string;
  pageId?: string;
  apiVersion: string;
}

const DEFAULT_API_VERSION = "v25.0";

/** Parse a `.env` file (KEY=VALUE per line) into process.env without overwriting. */
function loadDotEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/ at runtime, src/ during ts-node — the .env lives one level up either way.
  const candidates = [
    path.resolve(here, "..", ".env"),
    path.resolve(here, "..", "..", ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required env var ${name}. See mcp/meta-ads/.env.example and README.md.`,
    );
  }
  return value.trim();
}

export function loadConfig(): MetaConfig {
  loadDotEnv();

  let adAccountId = required("META_AD_ACCOUNT_ID");
  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;

  return {
    appId: process.env.META_APP_ID?.trim() || undefined,
    appSecret: process.env.META_APP_SECRET?.trim() || undefined,
    accessToken: required("META_SYSTEM_USER_TOKEN"),
    adAccountId,
    pageId: process.env.META_PAGE_ID?.trim() || undefined,
    apiVersion: process.env.META_API_VERSION?.trim() || DEFAULT_API_VERSION,
  };
}

/** HMAC-SHA256 of the access token, keyed by the app secret (Meta `appsecret_proof`). */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
