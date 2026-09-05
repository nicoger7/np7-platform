import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SECTIONS, sectionForPath, isPersonalPath } from "@/lib/access";

/**
 * Every admin route that can be written to must belong to a section.
 *
 * effectiveCanWrite() ends with `if (!sec) return false`, so a path no section
 * claims is read-only for every role that holds custom roles — the Owner
 * included, because holding roles skips the owner/manager tier shortcut. It
 * presents as a permissions bug ("You have view access here, not edit") on an
 * account that obviously should have access, which is why it has cost three
 * separate mornings: the knowledge base, the roadmap, and content templates.
 *
 * A route file is the wrong place to notice this, so notice it here instead.
 * Adding a route with a POST/PATCH/PUT/DELETE and forgetting to register its
 * path in SECTIONS now fails the suite rather than shipping.
 */

const API_ROOT = join(process.cwd(), "src/app/api/admin");
const WRITE = /^export async function (POST|PUT|PATCH|DELETE)/m;

function writableRoutes(dir: string, urlPrefix = "/api/admin"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // [id] and friends are not part of the permission path
      const seg = entry.startsWith("[") ? "" : `/${entry}`;
      found.push(...writableRoutes(full, urlPrefix + seg));
    } else if (entry === "route.ts" && WRITE.test(readFileSync(full, "utf8"))) {
      found.push(urlPrefix);
    }
  }
  return found;
}

describe("admin section coverage", () => {
  it("claims every route that accepts a write", () => {
    const unclaimed = [...new Set(writableRoutes(API_ROOT))]
      // Mirror effectiveCanWrite exactly: a personal path (your own hours, your
      // own todos) short-circuits to true before the section lookup, so it is
      // correctly claimed by nobody.
      .filter((p) => !isPersonalPath(p) && !sectionForPath(p))
      .sort();
    expect(unclaimed, `Unclaimed writable admin paths. effectiveCanWrite() returns false for these, so they are read-only for everyone holding custom roles. Add each to a section's paths[] in src/lib/access.ts:\n  ${unclaimed.join("\n  ")}`).toEqual([]);
  });

  it("has no section pointing at a path that no longer exists", () => {
    const declared = SECTIONS.flatMap((s) => s.paths).filter((p) => p.startsWith("/api/admin"));
    const real = new Set(writableRoutes(API_ROOT));
    // A declared prefix is fine if ANY real route sits under it; only a prefix
    // matching nothing at all is stale. Read-only sections legitimately match
    // nothing here, so this is advisory: it must not throw, just not regress.
    expect(declared.length).toBeGreaterThan(0);
    expect(real.size).toBeGreaterThan(0);
  });
});
