import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extractImages } from "@/lib/pd-web";

/**
 * The picture list a product page yields. The page below is made up, but it has
 * the four things real brand and shop pages have: a share image, a gallery with
 * srcset and WordPress size copies, the logo and payment icons, and JSON-LD.
 */
const PAGE = `
<html><head>
  <meta property="og:image" content="https://brand.example/wp-content/uploads/hydrofoil-slalom-85-deck.jpg">
  <script type="application/ld+json">{"@type":"Product","image":["https://brand.example/img/hydrofoil-slalom-85-bottom.webp"]}</script>
</head><body>
  <img src="/assets/logo.svg" alt="Brand logo">
  <img src="/assets/visa.png" alt="Visa" width="40">
  <img src="/wp-content/uploads/hydrofoil-slalom-85-deck-300x300.jpg"
       srcset="/wp-content/uploads/hydrofoil-slalom-85-deck-300x300.jpg 300w, /wp-content/uploads/hydrofoil-slalom-85-deck-1024x1024.jpg 1024w" alt="HydroFoil Slalom 85 deck">
  <img data-src="/wp-content/uploads/team-rider-action.jpg" alt="Team rider">
  <a href="/wp-content/uploads/hydrofoil-slalom-85-side.png">zoom</a>
  <img src="data:image/gif;base64,R0lGOD" alt="">
</body></html>`;

describe("extractImages", () => {
  const imgs = extractImages(PAGE, "https://brand.example/boards/hydrofoil-slalom/", ["HydroFoil", "Slalom", "85"]);
  const srcs = imgs.map((i) => i.src);

  it("drops logos, payment icons, svg and inline data", () => {
    expect(srcs.some((s) => /logo|visa|data:/.test(s))).toBe(false);
  });

  it("keeps one entry per master file, not every size copy", () => {
    expect(srcs.filter((s) => s.includes("hydrofoil-slalom-85-deck")).length).toBe(1);
  });

  it("resolves relative links and reads JSON-LD, gallery links and data-src", () => {
    expect(srcs).toContain("https://brand.example/img/hydrofoil-slalom-85-bottom.webp");
    expect(srcs).toContain("https://brand.example/wp-content/uploads/hydrofoil-slalom-85-side.png");
    expect(srcs).toContain("https://brand.example/wp-content/uploads/team-rider-action.jpg");
  });

  it("ranks pictures of the model above everything else", () => {
    expect(imgs[imgs.length - 1].src).toContain("team-rider-action");
  });
});
