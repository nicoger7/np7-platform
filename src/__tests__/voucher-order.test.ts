/**
 * Ordering a gift voucher on the website (/api/voucher), 27 Sep 2026.
 *
 *  · The value of a package voucher is the package's price, so the package
 *    must be one the gift form offers: active, not archived, on the website,
 *    and part of the chosen trip. The route only refused `archived`, so a
 *    hand-made POST could price a voucher from a draft or hidden package.
 *  · After the order the buyer is emailed how to pay and the team is told.
 *    Before, nobody heard anything until the money landed.
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
    ],
    exp_packages: [
      pkg({}),
      pkg({ id: "p-hidden", name: "Turkish Locals", website_visible: false }),
      pkg({ id: "p-draft", status: "draft" }),
      pkg({ id: "p-archived", archived_at: "2026-09-01T00:00:00Z" }),
      pkg({ id: "p-other", experience_id: "ex2" }),
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
  ])("a %s package: no voucher is created", async (_label, packageId, status) => {
    const r = await order({ experienceId: "ex1", packageId });
    expect(r.status).toBe(status);
    expect(state.db.rows("gift_vouchers")).toHaveLength(0);
    expect(state.orders).toHaveLength(0);
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
