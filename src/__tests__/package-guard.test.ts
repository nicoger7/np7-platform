/**
 * Private packages stay private on every public door (audit, 27 Sep 2026).
 *
 * A package with website_visible = false is sold by the team from admin, or by
 * a member passing on their own package through an invite link. The page hid
 * those packages, and hiding them was the only guard: /api/register booked the
 * Turkish Locals rate (€1,650) for anyone who posted its id, companions could
 * be put on it, /api/reserve took a deposit for it, and /api/register/quote
 * answered with the full payment plan of a hidden Bonaire 2027 room.
 *
 * Pinned here: the rule itself, what an invite unlocks (its own package, trip
 * and week, and nothing else), the companion roster judged by the same rule
 * and the same key, and the public quote refusing a private id with the same
 * 404 as an unknown one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { FakeSupabase } from "./stubs/fake-supabase";
import { packageSaleIssue, inviteUnlocks, invitePackageUnlock } from "@/lib/package-guard";
import { companionPackageIssue, validateCompanions } from "@/lib/group-register";

const state = vi.hoisted(() => ({ db: null as unknown as { from: (t: string) => unknown } }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/auth", () => ({ getPortalUser: async () => null }));
vi.mock("@/lib/tier-perks", () => ({ bookingPrice: async (_db: unknown, a: { price: number }) => ({ price: a.price }) }));
vi.mock("@/lib/gear-choice", () => ({
  makeGearResolver: () => async () => null,
  gearDelta: () => 0,
  gearOptions: () => null,
  parseGearChoice: (x: string | null | undefined) => x ?? "rental",
  parseGearBaseline: () => "rental",
}));

import { GET as quote } from "@/app/api/register/quote/route";

const TURKEY = "exp-alacati";
const WEEK = "ed-week-2";
const SCOPE = { experienceId: TURKEY, editionId: WEEK };

const visible = { id: "pkg-standard", status: "active", archived_at: null, experience_id: TURKEY, edition_id: WEEK, website_visible: true };
const locals = { ...visible, id: "pkg-turkish-locals", website_visible: false };

describe("packageSaleIssue", () => {
  it("sells an active, visible package of this trip and week", () => {
    expect(packageSaleIssue(visible, SCOPE)).toBeNull();
  });

  it("reads a row without the column as visible, which is the column's default", () => {
    const { website_visible: _omit, ...legacy } = visible;
    void _omit;
    expect(packageSaleIssue(legacy, SCOPE)).toBeNull();
  });

  it("refuses a private package to a request with no invite", () => {
    expect(packageSaleIssue(locals, SCOPE)).toBe("private");
    expect(packageSaleIssue(locals, { ...SCOPE, unlocked: new Set() })).toBe("private");
  });

  it("opens a private package only for the invite that carries it", () => {
    expect(packageSaleIssue(locals, { ...SCOPE, unlocked: new Set(["pkg-turkish-locals"]) })).toBeNull();
    expect(packageSaleIssue(locals, { ...SCOPE, unlocked: new Set(["some-other-private-package"]) })).toBe("private");
  });

  it("an invite never opens an archived, draft or other trip's package", () => {
    const key = { ...SCOPE, unlocked: new Set(["pkg-turkish-locals"]) };
    expect(packageSaleIssue({ ...locals, archived_at: "2026-09-01" }, key)).toBe("unavailable");
    expect(packageSaleIssue({ ...locals, status: "draft" }, key)).toBe("unavailable");
    expect(packageSaleIssue({ ...locals, experience_id: "exp-bonaire" }, key)).toBe("unavailable");
  });

  it("names the wrong week before the privacy, so a guest with an invite hears what they can fix", () => {
    expect(packageSaleIssue({ ...locals, edition_id: "ed-week-3" }, SCOPE)).toBe("other-week");
    expect(packageSaleIssue({ ...visible, edition_id: "ed-week-3" }, SCOPE)).toBe("other-week");
  });

  it("keeps a week-less package open to every week, and a week package closed to none-picked", () => {
    expect(packageSaleIssue({ ...visible, edition_id: null }, SCOPE)).toBeNull();
    expect(packageSaleIssue(visible, { ...SCOPE, editionId: null })).toBe("other-week");
  });

  it("refuses an id that matched nothing", () => {
    expect(packageSaleIssue(null, SCOPE)).toBe("unavailable");
    expect(packageSaleIssue(undefined, SCOPE)).toBe("unavailable");
  });
});

describe("what an invite unlocks", () => {
  const invite = { package_id: "pkg-turkish-locals", experience_id: TURKEY, edition_id: WEEK, status: "sent" };

  it("its own package, as a set, while the invite is live", () => {
    for (const status of ["sent", "opened", "booked"]) {
      expect([...inviteUnlocks({ ...invite, status }, SCOPE)], status).toEqual(["pkg-turkish-locals"]);
    }
  });

  it("nothing once it is cancelled or expired", () => {
    expect(inviteUnlocks({ ...invite, status: "cancelled" }, SCOPE).size).toBe(0);
    expect(inviteUnlocks({ ...invite, status: "expired" }, SCOPE).size).toBe(0);
  });

  it("nothing on another trip or another week", () => {
    expect(inviteUnlocks(invite, { ...SCOPE, experienceId: "exp-bonaire" }).size).toBe(0);
    expect(inviteUnlocks(invite, { ...SCOPE, editionId: "ed-week-3" }).size).toBe(0);
    expect(inviteUnlocks({ ...invite, experience_id: null }, SCOPE).size).toBe(0);
  });

  it("any week of its trip when the invite names none", () => {
    expect([...inviteUnlocks({ ...invite, edition_id: null }, { ...SCOPE, editionId: "ed-week-3" })]).toEqual(["pkg-turkish-locals"]);
  });

  it("nothing when there is no invite or it carries no package", () => {
    expect(inviteUnlocks(null, SCOPE).size).toBe(0);
    expect(inviteUnlocks({ ...invite, package_id: null }, SCOPE).size).toBe(0);
  });
});

describe("invitePackageUnlock reads trip_invites by token", () => {
  const db = () => new FakeSupabase({
    trip_invites: [{ token: "nico-3f9a2b", package_id: "pkg-turkish-locals", experience_id: TURKEY, edition_id: WEEK, status: "opened" }],
  });

  it("returns the invite's package for a live token on its own week", async () => {
    const got = await invitePackageUnlock(db(), "nico-3f9a2b", SCOPE);
    expect(got).toBeInstanceOf(Set);
    expect([...got]).toEqual(["pkg-turkish-locals"]);
  });

  it("returns an empty set for no token, an unknown token, or a failed read", async () => {
    expect((await invitePackageUnlock(db(), undefined, SCOPE)).size).toBe(0);
    expect((await invitePackageUnlock(db(), "   ", SCOPE)).size).toBe(0);
    expect((await invitePackageUnlock(db(), "someone-else", SCOPE)).size).toBe(0);
    const broken = db();
    broken.failOn("trip_invites", "select");
    expect((await invitePackageUnlock(broken, "nico-3f9a2b", SCOPE)).size).toBe(0);
  });
});

describe("companions are judged by the same rule, with the payer's key", () => {
  it("companionPackageIssue is the sale rule", () => {
    expect(companionPackageIssue(locals, SCOPE)).toBe("private");
    expect(companionPackageIssue(locals, { ...SCOPE, unlocked: new Set(["pkg-turkish-locals"]) })).toBeNull();
  });

  /** Packages, and no contacts: every companion is a new person. */
  function rosterDb() {
    const tables: Record<string, Record<string, unknown>[]> = { exp_packages: [visible, locals], contacts: [] };
    return {
      from(table: string) {
        const filters: ((r: Record<string, unknown>) => boolean)[] = [];
        const q = {
          select: () => q,
          in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return q; },
          eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return q; },
          ilike: (col: string, val: string) => { filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase()); return q; },
          order: () => q,
          limit: () => q,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (res: any, rej: any) =>
            Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(res, rej),
        };
        return q;
      },
    };
  }
  const friend = (packageId: string) => ({ firstName: "Mia", lastName: "K", email: "mia@example.com", packageId });

  it("a friend cannot be put on a private package", async () => {
    const out = await validateCompanions(rosterDb(), [friend("pkg-turkish-locals")], { ...SCOPE, payerEmail: "nico@example.com" });
    expect(out.ok).toBe(false);
    // Worded exactly like a missing package: nothing says a hidden rate exists.
    if (!out.ok) expect(out.error).toBe("The package chosen for Mia isn't available. Please pick another.");
  });

  it("but can ride along on the invite's own package", async () => {
    const out = await validateCompanions(rosterDb(), [friend("pkg-turkish-locals")], {
      ...SCOPE, payerEmail: "nico@example.com", unlocked: new Set(["pkg-turkish-locals"]),
    });
    expect(out.ok).toBe(true);
  });

  it("and a visible package is untouched by all of this", async () => {
    const out = await validateCompanions(rosterDb(), [friend("pkg-standard")], { ...SCOPE, payerEmail: "nico@example.com" });
    expect(out.ok).toBe(true);
  });
});

describe("the public quote", () => {
  beforeEach(() => {
    state.db = new FakeSupabase({
      exp_packages: [
        { ...visible, price: 1800, deposit: null, deposit_refund_days: 14, downpayment_percent: 50, final_days_before: 60, category: "Intermediate", gear_baseline: "rental" },
        { ...locals, price: 1650, deposit: null, deposit_refund_days: 14, downpayment_percent: 50, final_days_before: 60, category: "Intermediate", gear_baseline: "rental" },
        { ...visible, id: "pkg-old", archived_at: "2026-01-01", price: 1500 },
      ],
      exp_editions: [
        { id: WEEK, experience_id: TURKEY, deposit: null, date_start: "2027-06-05", launch_discount_pct: null, launch_price_until: null },
        { id: "ed-week-3", experience_id: TURKEY, deposit: null, date_start: "2027-06-12", launch_discount_pct: null, launch_price_until: null },
      ],
      exp_components: [],
    }) as unknown as { from: (t: string) => unknown };
  });

  const ask = async (qs: string) => {
    const req = { nextUrl: new URL(`https://www.np-seven.com/api/register/quote?${qs}`) } as unknown as NextRequest;
    const res = await quote(req);
    return { status: res.status, body: (await res.json()) as { price?: number; error?: string } };
  };

  it("prices a visible package", async () => {
    const { status, body } = await ask(`packageId=pkg-standard&editionId=${WEEK}`);
    expect(status).toBe(200);
    expect(body.price).toBe(1800);
  });

  it("answers a private, an archived and another week's package with the same 404 as an unknown id", async () => {
    const unknown = await ask(`packageId=nope&editionId=${WEEK}`);
    for (const qs of [`packageId=pkg-turkish-locals&editionId=${WEEK}`, `packageId=pkg-old&editionId=${WEEK}`, "packageId=pkg-standard&editionId=ed-week-3"]) {
      const got = await ask(qs);
      expect(got.status, qs).toBe(404);
      expect(got.body, qs).toEqual(unknown.body);
      expect(got.body.price, qs).toBeUndefined();
    }
  });
});
