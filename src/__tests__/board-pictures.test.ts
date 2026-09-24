import { describe, expect, it } from "vitest";
import { clearWinner, photosAfterKeep, researchPages } from "@/lib/board-pictures";
import type { BoardPhoto, BoardResearch } from "@/lib/board-measurements";
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

  it("never another board of the same size from a shop's related-boards strip", () => {
    const shopPage = "https://shop.example/product/jp-hydrofoil-slalom";
    const own: ImageCandidate = { src: "https://shop.example/img/a1b2c3~mv2.jpg", alt: null, width: null, score: 12, page: shopPage };
    const other: ImageCandidate = { src: "https://shop.example/img/starboard-isonic-85-2026.jpg", alt: "Starboard iSonic 85", width: null, score: 12, page: shopPage };
    expect(clearWinner({ size: "85", model: "HydroFoil Slalom", year: 2026 }, [own, other])).toBeNull();
  });

  it("reads the size from the typed name when the size field is still empty", () => {
    const board = { name: "FMX Invictus Pro 138", brand: "FMX", model: null, size: null, year: 2026 };
    expect(clearWinner(board, FMX)?.src).toContain("-138-2026.jpg");
    const wrong: ImageCandidate = { ...img("fmx-invictus-pro-128.jpg"), alt: "FMX Invictus Pro 128" };
    expect(clearWinner(board, [wrong])).toBeNull();
  });

  it("does not take a picture size or a date stamp for a year", () => {
    const sized = img("invictus-pro-138-2048x2048.jpg");
    expect(clearWinner({ size: "138", model: "Invictus Pro", year: 2026 }, [sized])?.src).toContain("2048x2048");
    const stamped = img("IMG_20250601_invictus-pro-138.jpg");
    expect(clearWinner({ size: "138", model: "Invictus Pro", year: 2026 }, [stamped])?.src).toContain("IMG_20250601");
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

describe("the photo list after keeping a picture", () => {
  const dir = "product-dev/boards/b1/web/";
  const set = (stamp: string, top = false): BoardPhoto[] => [
    { key: `${dir}${stamp}-fmx-138.jpg`, kind: null },
    { key: `${dir}${stamp}-fmx-138-deck.webp`, kind: top ? "top" : null, view: "deck", cutFrom: `${dir}${stamp}-fmx-138.jpg` },
    { key: `${dir}${stamp}-fmx-138-bottom.webp`, kind: null, view: "bottom", cutFrom: `${dir}${stamp}-fmx-138.jpg` },
  ];
  const upload: BoardPhoto = { key: "product-dev/boards/b1/sheet.jpg", caption: "tape sheet" };
  const three = [upload, ...set("aa"), ...set("bb"), ...set("cc", true)];

  it("the same picture kept again replaces all its earlier copies and their cut-outs", () => {
    const fresh = set("dd", true);
    const out = photosAfterKeep(three, fresh, { fileName: "fmx-138.jpg" });
    expect(out.map((p) => p.key)).toEqual([upload.key, ...fresh.map((p) => p.key)]);
    expect(out.filter((p) => p.kind === "top")).toHaveLength(1);
  });

  it("cut again: one clean set is left, uploads untouched", () => {
    const own = three[1];                                  // the "aa" original
    const again: BoardPhoto[] = [
      { key: `${dir}ee-fmx-138-deck.webp`, kind: "top", view: "deck", cutFrom: own.key },
      { key: `${dir}ee-fmx-138-bottom.webp`, kind: null, view: "bottom", cutFrom: own.key },
    ];
    const out = photosAfterKeep(three, again, { own });
    expect(out.map((p) => p.key)).toEqual([upload.key, own.key, ...again.map((p) => p.key)]);
  });

  it("another picture is only added, and takes over as the top view", () => {
    const other: BoardPhoto = { key: `${dir}ff-jp-85.webp`, kind: "top" };
    const out = photosAfterKeep(three, [other], { fileName: "jp-85.webp" });
    expect(out).toHaveLength(three.length + 1);
    expect(out.filter((p) => p.kind === "top").map((p) => p.key)).toEqual([other.key]);
  });
});
