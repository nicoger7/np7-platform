/**
 * Ordering a gift voucher on the website (/api/voucher), 27 Sep 2026.
 *
 *  · The value of a package voucher is the package's price, so the package
 *    must be one the gift form offers: active, not archived, on the website,
 *    and part of the chosen trip. The route only refused `archived`, so a
 *    hand-made POST could price a voucher from a draft or hidden package.
 *  · The package's week must be one the form offers too: published, not
 *    archived, not an event, not over. edition_id was selected and never read.
 *  · After the order the buyer is emailed how to pay and the team is told.
 *    Before, nobody heard anything until the money landed. The reply says
 *    whether that mail went out, so the screen only claims it when it did.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";
import type { VoucherOrder } from "@/lib/vouchers/notify";

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase, orders: [] as unknown[], limits: [] as { name: string; subject?: string | null }[] }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/auth", () => ({ getPortalUser: async () => null }));
// The route emails any address it is given, so it is rate-limited per caller
// and per address; here the limiter only records that it was asked.
vi.mock("@/lib/rate-limit", () => ({
  LIMITS: { mailToAnyAddress: { limit: 5, windowSeconds: 900 } },
  rateLimited: async (_req: unknown, opts: { name: string; subject?: string | null }) => {
    state.limits.push({ name: opts.name, subject: opts.subject });
    return null;
  },
}));
vi.mock("@/lib/vouchers/notify", () => ({
  sendVoucherOrdered: async (o: unknown) => {
    state.orders.push(o);
    return { buyer: true, team: 2 };
  },
}));

import { POST } from "@/app/api/voucher/route";

const pkg = (over: Row): Row => ({
  id: "p1", name: "No Hotel", price: 2390, experience_id: "ex1", edition_id: "ed1",
  status: "active", archived_at: null, website_visible: true, ...over,
});

beforeEach(() => {
  state.orders = [];
  state.limits = [];
  state.db = new FakeSupabase({
    exp_experiences: [
      { id: "ex1", title: "NP7 Experience Bonaire", currency: "EUR", status: "published" },
      { id: "ex2", title: "NP7 Experience Alaçatı", currency: "EUR", status: "published" },
      { id: "ex-clinic", title: "NP7 Coaching Clinics USA", currency: "EUR", status: "published", page_template: "event", website_visible: true },
      { id: "ex-hidden", title: "NP7 Signature Maui", currency: "EUR", status: "published", page_template: "full", website_visible: false },
    ],
    exp_packages: [
      pkg({}),
      pkg({ id: "p-hidden", name: "Turkish Locals", website_visible: false }),
      pkg({ id: "p-draft", status: "draft" }),
      pkg({ id: "p-archived", archived_at: "2026-09-01T00:00:00Z" }),
      pkg({ id: "p-other", experience_id: "ex2" }),
      pkg({ id: "p-past-week", edition_id: "ed-past" }),
      pkg({ id: "p-draft-week", edition_id: "ed-draft" }),
      pkg({ id: "p-archived-week", edition_id: "ed-archived" }),
      pkg({ id: "p-event-week", edition_id: "ed-event" }),
      pkg({ id: "p-lost-week", edition_id: "ed-gone" }),
      pkg({ id: "p-no-week", edition_id: null, price: 1450 }),
      pkg({ id: "p-early-week", edition_id: "ed-early", price: 2490 }),
      pkg({ id: "p-opened-week", edition_id: "ed-opened", price: 2590 }),
    ],
    exp_editions: [
      { id: "ed1", status: "published", kind: "trip", date_start: "2099-11-30", date_end: "2099-12-06", archived_at: null },
      { id: "ed-past", status: "published", kind: "trip", date_start: "2025-11-30", date_end: "2025-12-06", archived_at: null },
      { id: "ed-draft", status: "draft", kind: "trip", date_start: "2099-11-30", date_end: "2099-12-06", archived_at: null },
      { id: "ed-archived", status: "published", kind: "trip", date_start: "2099-11-30", date_end: "2099-12-06", archived_at: "2026-09-01T00:00:00Z" },
      { id: "ed-event", status: "published", kind: "event", date_start: "2099-10-10", date_end: "2099-10-11", archived_at: null },
      // Early access (migration 170): public only from public_from on.
      { id: "ed-early", status: "published", kind: "trip", date_start: "2099-11-30", date_end: "2099-12-06", archived_at: null, public_from: "2099-01-01" },
      { id: "ed-opened", status: "published", kind: "trip", date_start: "2099-11-30", date_end: "2099-12-06", archived_at: null, public_from: "2020-01-01" },
    ],
    company_settings: [{ division: "experience", iban: "DE00 1234", bic: "QNTODEB2", bank_name: "Qonto", legal_name: "NP7 GmbH", currency: "EUR" }],
    contacts: [],
    gift_vouchers: [],
  });
});

async function order(body: Record<string, unknown>) {
  const req = { json: async () => ({ buyerName: "Lena Ott", buyerEmail: "lena@example.com", amount: 400, ...body }) } as unknown as Request;
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("which packages can be gifted", () => {
  it("a visible, active package of the chosen trip: yes, at its price", async () => {
    const r = await order({ experienceId: "ex1", packageId: "p1" });
    expect(r.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ amount: 2390, status: "pending", package_id: "p1" });
  });

  it.each([
    ["hidden (website_visible false)", "p-hidden", 404],
    ["draft", "p-draft", 404],
    ["archived", "p-archived", 404],
    ["unknown", "p-nope", 404],
    ["of another trip", "p-other", 400],
    ["on a week that is over", "p-past-week", 404],
    ["on a draft week", "p-draft-week", 404],
    ["on an archived week", "p-archived-week", 404],
    ["on an event week", "p-event-week", 404],
    ["on a week that no longer exists", "p-lost-week", 404],
    // Review, 28 Sep 2026: the Crew/Legend head start is not for sale as a gift.
    ["on an early-access week (public_from still ahead)", "p-early-week", 404],
  ])("a %s package: no voucher is created", async (_label, packageId, status) => {
    const r = await order({ experienceId: "ex1", packageId });
    expect(r.status).toBe(status);
    expect(state.db.rows("gift_vouchers")).toHaveLength(0);
    expect(state.orders).toHaveLength(0);
  });

  it("a package with no week at all is sold on every week, so it can be gifted", async () => {
    const r = await order({ experienceId: "ex1", packageId: "p-no-week" });
    expect(r.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ amount: 1450, package_id: "p-no-week" });
  });

  it("a package with no trip chosen at all: no voucher", async () => {
    const r = await order({ packageId: "p1" });
    expect(r.status).toBe(400);
    expect(state.db.rows("gift_vouchers")).toHaveLength(0);
  });

  it("a hidden package gets the same answer as a missing one", async () => {
    const hidden = await order({ experienceId: "ex1", packageId: "p-hidden" });
    const missing = await order({ experienceId: "ex1", packageId: "p-nope" });
    expect(hidden.body.error).toBe(missing.body.error);
  });

  it("a week whose public_from has passed is open to everyone, so it can be gifted", async () => {
    const r = await order({ experienceId: "ex1", packageId: "p-opened-week" });
    expect(r.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ amount: 2590, package_id: "p-opened-week" });
  });

  it("reads the week's public_from, or the early-access rule never sees it", async () => {
    // The fake does not model column projection, so the select is recorded.
    const inner = state.db;
    const asked: string[] = [];
    state.db = {
      rows: (t: string) => inner.rows(t),
      from(table: string) {
        const q = inner.from(table);
        if (table === "exp_editions") {
          const select = q.select.bind(q) as (cols?: string) => typeof q;
          (q as unknown as { select: (cols?: string) => typeof q }).select = (cols?: string) => {
            asked.push(String(cols ?? ""));
            return select(cols);
          };
        }
        return q;
      },
    } as unknown as FakeSupabase;
    await order({ experienceId: "ex1", packageId: "p1" });
    expect(asked[0]).toMatch(/public_from/);
  });
});

describe("which trips a value voucher can name", () => {
  // Review, 28 Sep 2026: the route checked `published` only, so a hand-made
  // POST could order a value voucher for a clinic (card checkout, no voucher
  // field) or an off-website trip. The gift chooser offers neither.
  it.each([
    ["an event-template experience (a clinic)", "ex-clinic"],
    ["an experience that is off the website", "ex-hidden"],
    ["an unknown experience", "ex-nope"],
  ])("%s: 404, no voucher", async (_label, experienceId) => {
    const r = await order({ experienceId, amount: 600 });
    expect(r.status).toBe(404);
    expect(state.db.rows("gift_vouchers")).toHaveLength(0);
    expect(state.orders).toHaveLength(0);
  });

  it("the hidden trip gets the same answer as a missing one", async () => {
    const hidden = await order({ experienceId: "ex-hidden", amount: 600 });
    const missing = await order({ experienceId: "ex-nope", amount: 600 });
    expect(hidden.body.error).toBe(missing.body.error);
  });

  it("a normal trip still takes a value voucher", async () => {
    const r = await order({ experienceId: "ex1", amount: 600 });
    expect(r.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ amount: 600, experience_id: "ex1", package_id: null });
  });
});

describe("after the order", () => {
  it("emails the buyer the bank details and tells the team, once", async () => {
    const r = await order({ experienceId: "ex1", amount: 600, recipientName: "Anna", nicoCall: true, recipientPhone: "+49 170 000" });
    expect(r.status).toBe(200);
    expect(state.orders).toHaveLength(1);
    const o = state.orders[0] as VoucherOrder;
    const v = state.db.rows("gift_vouchers")[0];
    expect(o).toMatchObject({
      voucherId: v.id, code: v.code, amount: 600, currency: "EUR",
      buyerName: "Lena Ott", buyerEmail: "lena@example.com", recipientName: "Anna",
      experienceTitle: "NP7 Experience Bonaire", nicoCall: true, recipientPhone: "+49 170 000",
      bank: { iban: "DE00 1234", bic: "QNTODEB2", bank_name: "Qonto", legal_name: "NP7 GmbH" },
    });
  });

  it("tells the screen whether the order mail went out", async () => {
    const r = await order({ experienceId: "ex1", packageId: "p1" });
    expect(r.body).toMatchObject({ ok: true, emailed: true, pay: { iban: "DE00 1234" } });
  });

  it("any-trip value vouchers are ordered too, with no trip title", async () => {
    const r = await order({ amount: 1000 });
    expect(r.status).toBe(200);
    expect((state.orders[0] as VoucherOrder).experienceTitle).toBeNull();
  });
});

describe("the order route cannot be used to mail strangers", () => {
  it("asks the rate limiter per caller and per buyer address before sending", async () => {
    await order({});
    expect(state.limits).toEqual([
      { name: "voucher-order", subject: undefined },
      { name: "voucher-order", subject: "lena@example.com" },
    ]);
  });
});
