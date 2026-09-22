import { describe, it, expect } from "vitest";
import { boardTitle, compareBoards } from "@/lib/board-measurements";

/**
 * A board is called by year, brand, model, size (Nico, 2026-09-23), not by the
 * name somebody typed. The two real boards below were typed before the size
 * field existed, so their model and size live inside the name.
 */
const FMX = { name: "FMX 2026 Slalom 85", brand: "FMX", model: null, year: 2026 };
const JP = { name: "JP 2026 Foil Slalom", brand: "JP-Australia", model: null, year: 2026 };

describe("boardTitle", () => {
  it("reads model and size out of a typed name and says it did", () => {
    const t = boardTitle(FMX);
    expect(t).toMatchObject({ year: 2026, brand: "FMX", model: "Slalom", size: "85" });
    expect(t.guessed).toEqual({ model: true, size: true });
    expect(t.text).toBe("2026 FMX Slalom 85");
  });

  it("drops the short form of a brand from the name", () => {
    const t = boardTitle(JP);
    expect(t.model).toBe("Foil Slalom");
    expect(t.size).toBeNull();
    expect(t.text).toBe("2026 JP-Australia Foil Slalom");
  });

  it("stored fields win over the name and are not flagged", () => {
    const t = boardTitle({ ...FMX, model: "Slalom XR", size: "85" });
    expect(t.text).toBe("2026 FMX Slalom XR 85");
    expect(t.guessed).toEqual({ model: false, size: false });
  });

  it("keeps a unit that belongs to the size", () => {
    expect(boardTitle({ name: "iSonic 107 l", brand: "Starboard", model: null, year: 2025 }).size).toBe("107 l");
  });

  it("falls back to the typed name when there is nothing else", () => {
    expect(boardTitle({ name: "Mystery", brand: null, model: null, year: null }).text).toBe("Mystery");
  });
});

describe("compareBoards", () => {
  it("sorts newest year first, then brand, model and size as numbers", () => {
    const rows = [
      { name: "a", brand: "JP-Australia", model: "Slalom", size: "85", year: 2025 },
      { name: "b", brand: "FMX", model: "Slalom", size: "100", year: 2026 },
      { name: "c", brand: "FMX", model: "Slalom", size: "85", year: 2026 },
      { name: "d", brand: "Starboard", model: "iSonic", size: "90", year: 2026 },
    ];
    expect([...rows].sort(compareBoards).map((r) => r.name)).toEqual(["c", "b", "d", "a"]);
  });
});
