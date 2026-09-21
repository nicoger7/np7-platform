/**
 * exp_experiences.price is a single number typed in when an experience was
 * created and never revisited. On 21 Sep 2026 Tenerife's said €3,120 against a
 * real entry package of €2,190, Bonaire's €2,890 against €2,560, and Lake
 * Garda's €1,490 on a week with nothing on sale at all.
 *
 * Reading it to DECIDE MONEY is therefore always a bug: it only ever fires
 * where an experience has no purchasable package, which is exactly the state a
 * trip is in between seasons, and it quotes a figure nobody has checked since
 * June. The gift voucher charged from it, and the gift page showed the buyer
 * the same number before they pressed.
 *
 * This is a grep, not a behaviour test, because the failure is a line being
 * written again rather than a value coming out wrong — and the next person to
 * write `?? exp.price` will have a good reason at the time.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const MONEY_PATHS = [
  "src/app/api/voucher/route.ts",
  "src/components/experience/gift-buy-form.tsx",
  "src/lib/experience-cards.ts",
  "src/app/api/event/checkout/route.ts",
];

describe("the legacy experience price never decides money", () => {
  for (const path of MONEY_PATHS) {
    it(`${path} does not fall back to it`, () => {
      const src = read(path);
      // `exp.price`, `experience.price`, `selectedExp?.price` — any read of the
      // experience-level column in a file that quotes or charges a figure.
      const hits = [...src.matchAll(/\b(?:exp|experience|selectedExp)\??\.price\b/g)].map((m) => m[0]);
      expect(hits, `${path} reads the experience-level price column: ${hits.join(", ")}`).toEqual([]);
    });
  }

  it("the cards price a season from its own week, never a stored column", () => {
    const src = read("src/lib/experience-cards.ts");
    expect(src).toContain("cheapestPackagePrice(exp, ed.id)");
  });
});
