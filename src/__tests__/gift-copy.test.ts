/**
 * The gift voucher's guest-facing copy (Nico, 27 Sep 2026: "weird and
 * incorrect").
 *
 * A grep, like no-legacy-price.test.ts, because each of these failures was a
 * line of copy being written, not a value coming out wrong:
 *  - Long dashes read as machine-written to Nico. None in the gift surfaces.
 *  - The page sold "a trip" and confirmed "Gift voucher reserved 🎁", but the
 *    product is a value voucher and nothing is reserved.
 *  - Six surfaces explained redemption six ways, two of them processes that do
 *    not exist. The gift page, the print page and the PDF now all use the one
 *    sentence in lib/vouchers.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const GIFT_SURFACES = [
  "src/app/experience/gift/page.tsx",
  "src/components/experience/gift-buy-form.tsx",
  "src/components/portal/voucher-print.tsx",
  "src/lib/vouchers/voucher-pdf.tsx",
];

describe("gift voucher copy", () => {
  for (const path of GIFT_SURFACES) {
    it(`${path} has no long dashes`, () => {
      // The page title belongs to the SEO pass (its own metadata line), so it
      // is judged there, not here.
      const lines = read(path).split("\n").filter((l) => !/^export const metadata\b/.test(l));
      const hits = lines.filter((l) => /[–—]/.test(l));
      expect(hits, `${path} still has a long dash:\n${hits.join("\n")}`).toEqual([]);
    });
  }

  it("sells a voucher, not a reserved trip", () => {
    const form = read("src/components/experience/gift-buy-form.tsx");
    expect(form).toContain("Voucher ordered");
    expect(form).not.toMatch(/reserved/i);
    expect(form).not.toContain("🎁");
    expect(form).not.toContain("They pick the week");
    expect(form).not.toContain("The complete");
    expect(read("src/app/experience/gift/page.tsx")).toContain("Gift an NP7 voucher");
  });

  it("explains redemption with the one shared sentence", () => {
    for (const path of ["src/app/experience/gift/page.tsx", "src/components/portal/voucher-print.tsx", "src/lib/vouchers/voucher-pdf.tsx"]) {
      expect(read(path), path).toContain("VOUCHER_HOW_TO_REDEEM");
    }
    expect(read("src/lib/vouchers/voucher-pdf.tsx")).not.toContain("reply to your confirmation email and we");
  });

  it("does not promise an email that is not the one being sent", () => {
    const form = read("src/components/experience/gift-buy-form.tsx");
    expect(form).not.toContain("bank-transfer details and your voucher shortly");
    expect(form).toContain("We&apos;ve also emailed you these details.");
  });
});
