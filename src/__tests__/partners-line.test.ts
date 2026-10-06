import { describe, it, expect } from "vitest";
import { readPartners, DEFAULT_PARTNERS } from "@/lib/partners";

describe("the partners line", () => {
  it("falls back to Surfcenter, JP and NeilPryde when nothing is saved", () => {
    expect(readPartners(undefined).map((p) => p.name)).toEqual(["Surfcenter", "JP Australia", "NeilPryde"]);
    expect(readPartners(null)).toBe(DEFAULT_PARTNERS);
  });

  it("keeps an emptied list empty, because emptying it is a decision", () => {
    expect(readPartners([])).toEqual([]);
  });

  it("drops rows without a logo and links that are not http(s)", () => {
    expect(readPartners([
      { name: "A", logo: " https://x/a.svg ", url: "javascript:alert(1)" },
      { name: "B", logo: "", url: "https://b" },
      { name: "C", logo: "https://x/c.png", url: "https://c.example" },
    ])).toEqual([
      { name: "A", logo: "https://x/a.svg", url: "" },
      { name: "C", logo: "https://x/c.png", url: "https://c.example" },
    ]);
  });
});

describe("logo sizes are balanced by shape", () => {
  it("gives a long flat word mark less height than a compact one", async () => {
    const { optimalLogoHeight } = await import("@/components/experience/partner-logos");
    expect(optimalLogoHeight(4)).toBe(26);          // Surfcenter-like
    expect(optimalLogoHeight(15.1)).toBeLessThan(12); // JP long mark
    expect(optimalLogoHeight(15.1)).toBeGreaterThanOrEqual(10);
    expect(optimalLogoHeight(1)).toBe(30);           // a square mark is capped
  });
});
