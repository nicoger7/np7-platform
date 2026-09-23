# NP7 Plate Designer — deployment into np-seven.com › admin › Product Development

Handoff for the coding agent. This document travels together with **`np7-plate-designer.html`** — that one file is the entire application.

- Version: v22 (2026-09-17)
- File: `np7-plate-designer.html`, 164 348 bytes
- SHA-256: `d998e98240e6f2565f041c6c70ae32053523f1fb090dfba5e8dd06ed6fb20502`
- Author/owner: Nicolas (youtube@nicoprien.de)

## What it is

A browser tool for designing 3D-printable tail-cutout plates for NP7 windsurf boards. Users load a board file, the tool finds the two tail cut-outs, and they design stepped plates with exact screw-hole positions, then export print-ready files.

Capabilities: board import from **STL** (mesh scan with automatic tail-end detection) or **Shape3D `.s3dx`** (reads the cut-out layer parametrically — no mesh scan); pen-style Bézier path editor (Illustrator-like anchors/handles, mm grid + snapping, numeric entry, ghost outlines of other steps); stacked steps with reordering; explicit screw holes (per-hole diameter, draggable + numeric, auto-mirrored port↔starboard); exports: full plate or single step without base, **STL (binary, mm)** or **OBJ**, per side; design save/load as JSON (re-anchors onto a newly detected board).

## Deployment

It is one static, self-contained HTML file. No build step, no backend, no config.

1. Place `np7-plate-designer.html` in the Product Development environment's static assets.
2. Route suggestion: `admin/product-development/plate-designer` (serve the file directly, or link to it).
3. Done. Access control is whatever already protects the admin area — the app itself has no auth and needs none server-side.

### Embedding options

- **Direct link / new tab (recommended):** the UI is a full-page two-pane layout (controls + 3D viewport) and benefits from the whole window.
- **Iframe:** works. Give it `width:100%; height:100vh` and `allow="fullscreen"`. File pickers, drag-and-drop and downloads must be permitted: `sandbox` must include `allow-scripts allow-downloads allow-same-origin` if a sandbox is applied at all (no sandbox is simpler).

### External dependencies (2 CDN scripts)

Loaded in `<head>`:

- `https://cdn.tailwindcss.com` (Tailwind runtime)
- `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` (Three.js r128 — must stay r128)

If CSP or offline reliability matters, vendor both: download the two files, place them next to the HTML, and change the two `<script src=…>` URLs at the top of the file to relative paths. No other network access exists anywhere in the app.

### CSP summary (if the admin sets one)

`script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdnjs.cloudflare.com; worker-src blob:` — the app uses inline script (single-file design), Blob URLs for file downloads, and no fetch/XHR at all.

## NP7 changes on top of v22 (in the platform, 2026-09-23)

The file in this folder is no longer byte-for-byte the handed-over v22 (that one had SHA-256 `d998e982…20502`). What changed, so a v23 can be merged:

1. **The look.** The panel uses the Product Development admin's design: Poppins (from media.np-seven.com), the admin's light/dark tokens, one colour per section (board file sky, Shape3D indigo, cut-out search amber, plate violet, screw holes pink, steps teal, export green; port and starboard keep the 3D view's blue and green). The CSS is the `NP7 look` block in `<head>`, the panel markup was rewritten with every id and `data-*` hook kept, and `renderPlateTab`, `makeSlider`, the board facts and the detection messages build `np-*` markup. The toggles set `is-on` instead of six Tailwind classes. Nothing about the geometry changed.
2. **Escaping.** File names and Shape3D layer names are escaped before they go into the panel (`escHtml`), because a project's board file can come from a colleague.
3. **Projects.** Not in this file: `np7-projects.js` is added just before `</body>` when the admin serves the page (`src/lib/plate-designer-page.ts`). It saves and opens projects through `/api/admin/product-dev/plate-designs` (table `pd_plate_designs`, migration 258), keeps the board file in the private `documents` bucket (named by its SHA-256), follows the admin's theme and tells the admin page which project is open. It works only through the tool's own functions (`saveDesign`, `loadDesign`, `loadSTL`, `loadS3dxFile`, ...); `src/__tests__/plate-designer-embed.test.ts` fails if a new version drops one of them.

4. **The plate follows the rail** (Shape3D boards). The outline is the board's widest line, but the rail is only that wide at one height (the edge tucks in at the bottom, the rail pulls in above its widest point). `parseS3DX` now reads the cross-sections (`Couples_n`), `s3dxRailHalfWidth` gives the real half-width at any station and height, and `buildPlateGeometry` pulls every vertex of the plate and its steps in to the rail at its own height (`railClampGeometry`; extrusions are subdivided every 1.5 mm so the side follows the curve). On by default (`s3dxParams.railFollow`), "Inset from rail" is the gap to it, holes that would cut the rail are skipped. The 3D board is built from the real sections too, and the Shape3D card has a close-up of the rail at any station. STL boards are unchanged.

5. **Shape3D boards show their recesses** (`s3dxBuildBoardFromSections`): the cut-out is cut into the 3D board (inner wall, floor, open to the rail or with an outer wall, end walls), so the plates are seen sitting in it, the way an STL shows it. Every ring keeps the same point count so the loft stays clean; the cut-out's ends are doubled stations. The board is rebuilt after cut-out slider changes.
6. **Import** (projects layer): "Import files" in the Projects list takes a board file and an old design `.json` together and saves them as one project.

7. **Plates follow the bottom, and export ready to print.** The recess floor is not flat (Shape3D: the bottom offset by the layer depth; STL: the floor triangles themselves, kept on the cut-out). With "Follows the bottom" on (default, `detection.followBottom`, saved in the design), every point of every layer is lifted onto the floor under it (`floorSampler`), so the steps continue the bottom's V and concaves. Plates are now built by `buildLayerSolid` (not ExtrudeGeometry): outline triangulated, Delaunay-flipped and refined to 8 mm, sides split for the rail, every point through one map (floor + soft rail clamp), degenerate triangles dropped. Result on the 2027 Shape3D boards: closed solids (0 open, 0 non-manifold edges), port = starboard volume, ~40 ms a build. STL outlines that cross themselves are untangled; a side whose outline traced badly takes the other side's, mirrored. Exports lie flat: Z up, floor side down on Z = 0, centred, mm, named after the project, plus "Both plates in one file".

After changing either file: `node scripts/plate-designer-embed.mjs`, commit the regenerated `src/lib/plate-designer-html.generated.ts` with it.

So the "Data handling" section below is now only true for the tool on its own: in the admin, Save uploads the board file and the design to NP7.

## Data handling

Everything is client-side. Board files (STL/s3dx) are read in the browser and never uploaded; designs are saved by downloading a JSON file; exports are generated in the browser as Blob downloads. No cookies, no localStorage, no analytics, no requests to any server. Nothing to declare for privacy review beyond "local file processing".

## Browser requirements

Desktop browser with WebGL (any current Chrome/Edge/Firefox/Safari). Pointer-based editing — usable on tablets, designed for mouse. Typical board STLs are 5–15 MB / ~200 k triangles; any normal machine handles this.

## Optional platform integrations (future work, not required)

The clean hook points if NP7 later wants server-side persistence:

- `saveDesign()` / `loadDesign(file)` — currently download/upload a JSON file. Swapping these to POST/GET against a platform endpoint gives shared team design storage. The JSON schema is versioned (`type: "board-plate-design", version: 1`).
- `exportGeomsAsSTL(geoms, filename)` — single choke point for all exports if you want exports archived to the platform as well.
- Board library: the file inputs (`#file-input` for STL, `#s3dx-input` for s3dx) could be augmented with a dropdown of NP7 board files fetched from the platform.

## Smoke test after deploy (2 minutes)

1. Open the page — left panel + empty 3D grid appear, no console errors.
2. Drop a board STL → board renders; press **Detect cut-outs** → "Detected 2 cut-outs", plates appear blue/green.
3. Plate tab → expand Step → **Export this step only → Port** → an `.stl` downloads.
4. **Save design** → JSON downloads; reload page, re-import board, **Load design** → plates return with holes.

If step 3's download is blocked, the page is inside a sandboxed iframe missing `allow-downloads` — fix the embed, not the app.
