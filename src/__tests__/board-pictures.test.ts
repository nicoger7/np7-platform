import { describe, expect, it } from "vitest";
import { clearWinner, researchPages } from "@/lib/board-pictures";
import type { BoardResearch } from "@/lib/board-measurements";
import type { ImageCandidate } from "@/lib/pd-web";

/**
 * Which picture the system keeps by itself (Nico, 24.09.2026: "cant the system
 * search itself?"). The candidates are what the finder read off FMX's own
 * Invictus Pro 2026 page: every size's picture, all with the same alt text.
 */

const shop = "https://www.fmxracing.eu/cdn/shop/files/";
const page = "https://www.fmxracing.eu/products/fmx-racing-invictus-2026-pro";
const img = (file: string, score = 11): ImageCandidate => ({ src: `${shop}${file}?v=1762260391&width=700`, alt: "FMX Racing - Invictus PRO 2026", width: 700, score, page });
const FMX = [
  img("fmx-racing-invitus-pro-138-2026.jpg", 13),
  img("fmx-racing-invitus-pro-78-2026.jpg"),
  img("fmx-racing-invitus-pro-2026-1.jpg"),
  img("fmx-racing-invitus-pro-2026-2.jpg"),
  img("fmx-racing-invitus-pro-88-2026.jpg"),
  img("fmx-racing-invitus-pro-98-2026.jpg"),
  img("fmx-racing-invitus-pro-104-2026.jpg"),
];

describe("the picture kept by itself", () => {
  it("is the one naming the board's size", () => {
    expect(clearWinner({ size: "138", model: "Invictus Pro" }, FMX)?.src).toContain("-138-2026.jpg");
    expect(clearWinner({ size: "88", model: "Invictus Pro" }, FMX)?.src).toContain("-88-2026.jpg");
  });

  it("is nothing when no picture names the size (a person picks)", () => {
    expect(clearWinner({ size: "118", model: "Invictus Pro" }, FMX)).toBeNull();
    // The size lives in the file name, not in the CDN's width parameter.
    expect(clearWinner({ size: "700", model: "Invictus Pro" }, FMX)).toBeNull();
  });

  it("skips detail and side shots even when they name the size", () => {
    const withDetail = [img("invictus-138-tail-detail.jpg", 20), ...FMX];
    expect(clearWinner({ size: "138", model: "Invictus Pro" }, withDetail)?.src).toContain("-138-2026.jpg");
  });

  it("reads sizes typed with a unit", () => {
    expect(clearWinner({ size: "138 l", model: "Invictus Pro" }, FMX)?.src).toContain("-138-2026.jpg");
  });

  it("never a picture of another year (JP's 2025 85 is not the 2026 85)", () => {
    const jp = (file: string, pg: string): ImageCandidate => ({ src: `https://jp-australia.com/wp-content/uploads/${file}`, alt: null, width: null, score: 13, page: pg });
    const old = jp("2024/09/JP25-HydroFoil-SL-85-deck-20392.webp", "https://jp-australia.com/p/windsurfing/ws-foil-boards/hydrofoil-slalom-2025/");
    expect(clearWinner({ size: "85", model: "HydroFoil Slalom", year: 2026 }, [old])).toBeNull();
    // The year can sit in the page's address only.
    const oldPage = jp("2025/09/HydroFoil-SL-85-deck.webp", "https://jp-australia.com/p/windsurfing/ws-foil-boards/hydrofoil-slalom-2025/");
    expect(clearWinner({ size: "85", model: "HydroFoil Slalom", year: 2026 }, [oldPage])).toBeNull();
    const now = jp("2025/10/JP26-HydroFoil-SL-85-deck.webp", "https://jp-australia.com/p/windsurfing/boards/hydrofoil-slalom/");
    expect(clearWinner({ size: "85", model: "HydroFoil Slalom", year: 2026 }, [old, now])?.src).toContain("JP26-HydroFoil-SL-85-deck");
    // FMX names its year in full.
    expect(clearWinner({ size: "138", model: "Invictus Pro", year: 2026 }, FMX)?.src).toContain("-138-2026.jpg");
  });

  it("without a size, only a single picture carrying every model word", () => {
    const pics = [img("hydrofoil-slalom-deck.jpg"), img("jp-foil-range.jpg")];
    expect(clearWinner({ size: null, model: "Hydrofoil Slalom" }, pics)?.src).toContain("hydrofoil-slalom-deck.jpg");
    const two = [img("hydrofoil-slalom-deck.jpg"), img("hydrofoil-slalom-bottom.jpg")];
    expect(clearWinner({ size: null, model: "Hydrofoil Slalom" }, two)).toBeNull();
  });
});

describe("the pages Research found", () => {
  const r = {
    links: [
      { title: "FMX", url: "https://www.fmxracing.com/", kind: "official" },
      { title: "Forum", url: "https://www.seabreeze.com.au/forums/x", kind: "forum" },
      { title: "Shop", url: "https://www.nimo.si/product-page/fmx-racing-invictus-pro", kind: "shop" },
      { title: "Invictus", url: page, kind: "official" },
    ],
  } as unknown as BoardResearch;

  it("the brand's product page first, shops after, never forums or a bare home page", () => {
    expect(researchPages(r)).toEqual([page, "https://www.nimo.si/product-page/fmx-racing-invictus-pro"]);
  });

  it("nothing without a research run", () => {
    expect(researchPages(null)).toEqual([]);
  });
});
