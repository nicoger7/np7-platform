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

  it("says 'we've also emailed you these details' only when there are details, and the mail went out", () => {
    // Review, 27 Sep 2026: with no IBAN in company settings the screen showed
    // no bank details and still claimed to have emailed them.
    const form = read("src/components/experience/gift-buy-form.tsx");
    const gate = form.indexOf("{done.pay ? (");
    const line = form.indexOf("We&apos;ve also emailed you these details.");
    expect(gate).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(gate);
    expect(form.slice(gate, line)).toContain("done.emailed !== false");
    expect(form).toContain("Reply to it and we'll send you our bank details.");
  });

  it("never tells a trip voucher's buyer it works on any NP7 trip", () => {
    // The redeem route refuses a trip voucher on another trip. The line under
    // the value comes from giftValueLine (gift-catalog.ts), tested there.
    const form = read("src/components/experience/gift-buy-form.tsx");
    expect(form).toContain("giftValueLine(choice)");
    expect(form).not.toMatch(/Worth the[^"]*any NP7 trip/);
  });

  it("the logged-out link opens the login page on 'create account'", () => {
    expect(read("src/app/experience/gift/page.tsx")).toContain('href="/account/login?mode=register&next=/experience"');
    const login = read("src/app/account/login/page.tsx");
    expect(login).toContain('mode === "register"');
    expect(login).toMatch(/initialMode=\{expired \? "magic" : register \? "register" : "login"\}/);
  });

  it("the print page names who the voucher is from, through the buyer FK hint", () => {
    // gift_vouchers has two FKs to contacts; a short contacts(...) embed
    // answers 300 and the page would bounce the member back to the list.
    const src = read("src/app/account/vouchers/[id]/print/page.tsx");
    const select = src.split("\n").find((l) => l.includes('.select("*, exp_experiences(title)')) ?? "";
    expect(select).toContain("buyer:contacts!buyer_contact_id(name)");
    expect(select).not.toMatch(/[\s,(]contacts\(/);
    expect(src).toContain("fromName={v.buyer?.name ?? null}");
  });

  it("with no bank details and no mail, asks the buyer to write instead of promising an email", () => {
    // Review, 28 Sep 2026: "We'll email you our bank details." after a mail
    // that failed promised something nothing sends.
    const form = read("src/components/experience/gift-buy-form.tsx");
    expect(form).not.toContain("We'll email you our bank details.");
    expect(form).toContain("with reference {done.code} and we&apos;ll send you our bank details.");
    expect(form).toContain('href="mailto:experience@np-seven.com"');
  });

  it("the level hint comes from the week's own levels, not a fixed pair", () => {
    const form = read("src/components/experience/gift-buy-form.tsx");
    expect(form).not.toContain("Beginner and Advanced ride in separate coaching groups.");
    expect(form).toContain("giftLevelHint(week.levels)");
  });

  it("the admin activate dialog does not promise a flat 2 years", () => {
    // The activate route keeps a use-by date typed on a pending voucher.
    const page = read("src/app/admin/vouchers/page.tsx");
    expect(page).not.toContain("starts the 2-year validity clock");
    expect(page).toContain("starts the validity clock (2 years unless a use-by date is set)");
  });
});
