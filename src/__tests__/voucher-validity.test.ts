/**
 * Every voucher is valid 2 years (Nico, 27 Sep 2026: "maybe 2 for now").
 *
 * It was 1 year, with 2 only for an any-trip voucher over €5,000: a rule in
 * two admin routes, one form and a gift-page chip that needed a whole
 * sentence to explain it. One number now, and no surface may still say
 * "1 year".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vouchers from "@/lib/vouchers";
import { VOUCHER_VALID_MONTHS, VOUCHER_VALIDITY_LABEL, redeemByFrom } from "@/lib/vouchers";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** The code and copy only: comments may tell the history ("it was 1 year"). */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("voucher validity", () => {
  it("is 24 months from activation, for every voucher", () => {
    expect(VOUCHER_VALID_MONTHS).toBe(24);
    expect(redeemByFrom("2026-09-27T10:00:00Z")).toBe("2028-09-27");
    expect(redeemByFrom("2027-01-31T10:00:00Z").slice(0, 4)).toBe("2029");
    expect(VOUCHER_VALIDITY_LABEL).toBe("Valid for 2 years");
  });

  it("has no amount or trip rule left to apply", () => {
    expect("voucherValidMonths" in vouchers).toBe(false);
    expect("defaultRedeemBy" in vouchers).toBe(false);
    for (const path of ["src/app/api/admin/vouchers/route.ts", "src/app/api/admin/vouchers/[id]/route.ts"]) {
      const src = withoutComments(read(path));
      expect(src, path).toContain("redeemByFrom(now)");
      expect(src, path).not.toMatch(/> ?5000/);
    }
  });

  it.each([
    "src/app/experience/gift/page.tsx",
    "src/components/experience/gift-buy-form.tsx",
    "src/components/portal/voucher-print.tsx",
    "src/lib/vouchers/voucher-pdf.tsx",
    "src/app/admin/vouchers/page.tsx",
    "src/lib/vouchers.ts",
    "src/app/api/voucher/route.ts",
    "src/lib/email/templates.ts",
    "src/lib/email/default-bodies.ts",
  ])("%s never says 1 year", (path) => {
    const src = withoutComments(read(path));
    expect(src).not.toMatch(/\b(1|one)[ -]year\b/i);
    expect(src).not.toMatch(/over €5,000|over €5k/i);
  });

  it("the gift page and the form state it from the one label", () => {
    expect(read("src/app/experience/gift/page.tsx")).toContain("VOUCHER_VALIDITY_LABEL");
    expect(read("src/components/experience/gift-buy-form.tsx")).toContain("VOUCHER_VALIDITY_LABEL");
    expect(read("src/app/admin/vouchers/page.tsx")).toContain("Empty = 2 years from activation.");
  });
});
