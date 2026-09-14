/**
 * The group total behind the registration modal's payment plan.
 *
 * The modal used to quote the payer's own seat while the roster underneath it
 * added up the whole group: "Downpayment (50% of your trip) €1,440" on the same
 * screen as "Total for 2 spots €7,470". /api/register/quote now sums the
 * companions into the total it hands computePaymentPlan, which makes these two
 * rules money: which chosen packages count, and how often each one counts.
 *
 * Both are shared with the registration that actually writes the bookings
 * (validateCompanions), so a package the quote priced can never be one the
 * signup then refuses.
 */
import { describe, it, expect } from "vitest";
import { companionPackageIssue, sumCompanionPrices } from "@/lib/group-register";

const WEEK = { experienceId: "exp-bonaire", editionId: "ed-week-1" };
const ok = { status: "active", archived_at: null, experience_id: "exp-bonaire", edition_id: null };

describe("companionPackageIssue", () => {
  it("accepts an active package of this experience that belongs to no single week", () => {
    expect(companionPackageIssue(ok, WEEK)).toBeNull();
  });

  it("accepts a package scoped to exactly this week", () => {
    expect(companionPackageIssue({ ...ok, edition_id: "ed-week-1" }, WEEK)).toBeNull();
  });

  it("refuses another week's package", () => {
    expect(companionPackageIssue({ ...ok, edition_id: "ed-week-2" }, WEEK)).toBe("other-week");
  });

  it("refuses another experience, a draft and an archived package", () => {
    expect(companionPackageIssue({ ...ok, experience_id: "exp-turkey" }, WEEK)).toBe("unavailable");
    expect(companionPackageIssue({ ...ok, status: "draft" }, WEEK)).toBe("unavailable");
    expect(companionPackageIssue({ ...ok, archived_at: "2026-01-01" }, WEEK)).toBe("unavailable");
  });

  it("refuses an id that matched no package at all", () => {
    expect(companionPackageIssue(null, WEEK)).toBe("unavailable");
    expect(companionPackageIssue(undefined, WEEK)).toBe("unavailable");
  });

  it("refuses a week-scoped package when the payer picked no week", () => {
    expect(companionPackageIssue({ ...ok, edition_id: "ed-week-1" }, { ...WEEK, editionId: null })).toBe("other-week");
  });
});

describe("sumCompanionPrices", () => {
  const prices = new Map([["adv-standard", 4590], ["beg-none", 1620]]);

  it("counts one companion once", () => {
    expect(sumCompanionPrices(["adv-standard"], prices)).toEqual({ total: 4590, counted: 1 });
  });

  it("counts the same package once per person, never de-duplicated", () => {
    // Two friends sharing a room type is the normal case; summing the distinct
    // packages would quote the payer a spot short.
    expect(sumCompanionPrices(["adv-standard", "adv-standard"], prices)).toEqual({ total: 9180, counted: 2 });
  });

  it("adds different packages together", () => {
    expect(sumCompanionPrices(["adv-standard", "beg-none"], prices)).toEqual({ total: 6210, counted: 2 });
  });

  it("skips what it could not price, and says so in the count", () => {
    expect(sumCompanionPrices(["adv-standard", "other-weeks-package"], prices)).toEqual({ total: 4590, counted: 1 });
  });

  it("is zero for nobody", () => {
    expect(sumCompanionPrices([], prices)).toEqual({ total: 0, counted: 0 });
  });

  it("keeps cents clean when packages carry them", () => {
    const withCents = new Map([["a", 1633.33], ["b", 1633.33]]);
    expect(sumCompanionPrices(["a", "b"], withCents).total).toBe(3266.66);
  });
});

describe("the payer's plan total", () => {
  it("is their own spot plus everyone they bring", () => {
    // The founder's screenshot: his own No Hotel week at 2,880 and one friend
    // in a 4,590 room. The roster said 7,470 and the plan said 2,880.
    const priceByPackage = new Map([["friends-room", 4590]]);
    const rows = [{ id: "friends-room", ...ok }];
    const priced = new Map(
      rows.filter((r) => companionPackageIssue(r, WEEK) === null).map((r) => [r.id, priceByPackage.get(r.id)!]),
    );
    const { total, counted } = sumCompanionPrices(["friends-room"], priced);
    expect(2880 + total).toBe(7470);
    expect(1 + counted).toBe(2);
  });
});
