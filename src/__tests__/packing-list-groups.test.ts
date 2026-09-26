/**
 * The packing list went through checklist(), which put a green tick on every
 * line, the team's own group headings included, so Bonaire's list read as
 * twenty-four identical ✓ lines (Nico, 26 Sep 2026: "I would like that not all
 * the things are with ✅. Instead: 🌊 For the water / - / - / ☀️ For the
 * Bonaire sun / - / -").
 */
import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/email/templates";

const LIST = [
  "🌊 For the water",
  "Rashguard / UV shirt",
  "A couple of swimsuits",
  "☀️ For the Bonaire sun",
  "LOTS of high SPF sunscreen",
  "Hat or cap",
].join("\n");

const html = () => renderTemplate("pre_trip_info", { firstName: "Paul", experienceTitle: "NP7 Experience Bonaire", packingList: LIST }).html;

describe("the packing list reads as groups, not ticks", () => {
  it("puts no tick on anything", () => {
    const section = html().slice(html().indexOf("What to bring"));
    expect(section).not.toContain("✓");
    expect(section).not.toContain("✅");
  });

  it("turns emoji lines into headings, not bullets", () => {
    const h = html();
    // headings are paragraphs, never list items
    expect(h).toMatch(/<p[^>]*>🌊 For the water<\/p>/);
    expect(h).toMatch(/<p[^>]*>☀️ For the Bonaire sun<\/p>/);
    expect(h).not.toMatch(/<li[^>]*>[^<]*<\/span>🌊/);
  });

  it("keeps every item, under its own heading", () => {
    const h = html();
    const water = h.indexOf("For the water"), sun = h.indexOf("For the Bonaire sun");
    expect(h.indexOf("Rashguard")).toBeGreaterThan(water);
    expect(h.indexOf("Rashguard")).toBeLessThan(sun);
    expect(h.indexOf("sunscreen")).toBeGreaterThan(sun);
    expect((h.match(/&bull;/g) ?? []).length).toBe(4);
  });

  it("a list without any emoji is just bullets", () => {
    const plain = renderTemplate("pre_trip_info", { firstName: "Paul", packingList: "Towel\nSunscreen" }).html;
    expect((plain.match(/&bull;/g) ?? []).length).toBe(2);
    expect(plain).not.toContain("✓");
  });
});
