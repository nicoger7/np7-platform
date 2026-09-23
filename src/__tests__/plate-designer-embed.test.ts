import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PLATE_DESIGNER_HTML, PLATE_DESIGNER_PROJECTS_JS, PLATE_DESIGNER_SHA256 } from "@/lib/plate-designer-html.generated";
import { PLATE_DESIGNER_PAGE } from "@/lib/plate-designer-page";

/**
 * The Plate Designer ships as a string module generated from the HTML file and
 * the NP7 projects layer. If somebody changes either file and forgets to run
 * scripts/plate-designer-embed.mjs, the admin keeps serving the old tool.
 */
describe("plate designer embed", () => {
  const raw = readFileSync("src/product-dev/plate-designer/np7-plate-designer.html", "utf8");
  const layer = readFileSync("src/product-dev/plate-designer/np7-projects.js", "utf8");
  const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

  it("serves exactly the files in the repo", () => {
    expect(sha(PLATE_DESIGNER_HTML)).toBe(sha(raw));
    expect(PLATE_DESIGNER_SHA256).toBe(sha(raw));
    expect(PLATE_DESIGNER_PROJECTS_JS).toBe(layer);
  });

  it("is the NP7 Plate Designer with its s3dx import", () => {
    expect(PLATE_DESIGNER_HTML).toContain("<title>NP7 Plate Designer");
    expect(PLATE_DESIGNER_HTML).toContain("s3dx-input");
  });

  it("adds the projects layer once, at the end of the page", () => {
    expect(PLATE_DESIGNER_PAGE.split(PLATE_DESIGNER_PROJECTS_JS).length).toBe(2);
    // After the tool's own script (which ends by opening the Board tab).
    expect(PLATE_DESIGNER_PAGE.indexOf(PLATE_DESIGNER_PROJECTS_JS)).toBeGreaterThan(PLATE_DESIGNER_HTML.lastIndexOf("switchTab('board');"));
    // Inlined in a <script>: the layer must never close it early.
    expect(PLATE_DESIGNER_PROJECTS_JS.toLowerCase()).not.toContain("</script");
  });

  it("still has every function and element the projects layer works through", () => {
    const fns = ["loadSTL", "loadS3dxFile", "onBoardLoaded", "onS3dxLoaded", "saveDesign", "loadDesign",
      "defaultPlate", "rebuildPlates", "rebuildSceneHelpers", "renderPlateTab", "switchTab",
      "renderDetectionControls", "syncTailButtons", "detectCutouts", "renderS3dxControls", "s3dxRebuild"];
    for (const f of fns) expect(raw, f).toMatch(new RegExp(`\\bfunction ${f}\\(`));
    for (const v of ["plateA", "plateB", "detection", "detectedCutouts", "s3dxData", "s3dxParams", "boardGeometry", "boardMesh", "boardBounds", "loadedCutoutRef", "currentTab"]) {
      expect(raw, v).toMatch(new RegExp(`\\blet ${v}\\b`));
    }
    for (const id of ["np-head", "flip-board-btn", "design-status", "upload-status", "s3dx-status", "s3dx-layer", "detection-controls", "s3dx-controls", "board-controls", "export-a-btn", "export-b-btn"]) {
      expect(raw, id).toContain(`id="${id}"`);
    }
  });
});
