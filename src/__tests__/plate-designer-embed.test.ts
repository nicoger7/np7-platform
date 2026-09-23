import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PLATE_DESIGNER_HTML, PLATE_DESIGNER_SHA256 } from "@/lib/plate-designer-html.generated";

/**
 * The Plate Designer ships as a string module generated from the HTML file it
 * was handed over as. If somebody drops in a new version of the HTML and forgets
 * to run scripts/plate-designer-embed.mjs, the admin keeps serving the old tool.
 */
describe("plate designer embed", () => {
  const raw = readFileSync("src/product-dev/plate-designer/np7-plate-designer.html", "utf8");
  const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

  it("serves exactly the HTML file in the repo", () => {
    expect(sha(PLATE_DESIGNER_HTML)).toBe(sha(raw));
    expect(PLATE_DESIGNER_SHA256).toBe(sha(raw));
  });

  it("is the NP7 Plate Designer with its s3dx import", () => {
    expect(PLATE_DESIGNER_HTML).toContain("<title>NP7 Plate Designer");
    expect(PLATE_DESIGNER_HTML).toContain("s3dx-input");
  });
});
