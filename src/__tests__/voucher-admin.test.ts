/**
 * The admin side of gift vouchers (27 Sep 2026).
 *
 *  · the "Use by" date typed in New voucher was thrown away: the route always
 *    wrote the default from today. A typed date now wins.
 *  · the default is 2 years for every voucher (Nico: "maybe 2 for now"). It was
 *    1 year, with 2 only for an any-trip voucher over €5,000.
 *  · activation put the voucher in nobody's account, so a recipient who signed
 *    in found nothing until they had already used it. It now links the one
 *    contact that owns the recipient's address, and nobody when that is unclear,
 *    and nobody while Nico is still to call them with the news.
 *  · a partly used voucher keeps its amount: part of it is already a payment.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";
import { VOUCHER_VALID_MONTHS, parseRedeemBy, redeemByFrom, soleContactId } from "@/lib/vouchers";

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase, issued: [] as string[] }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminGate: async () => null }));
vi.mock("@/lib/vouchers/notify", () => ({
  sendVoucherIssued: async (id: string) => {
    state.issued.push(id);
    return { sentTo: [], attached: false };
  },
}));

import { POST } from "@/app/api/admin/vouchers/route";
import { PATCH } from "@/app/api/admin/vouchers/[id]/route";

const req = (body: unknown) => ({ json: async () => body, url: "http://x/api/admin/vouchers" }) as unknown as NextRequest;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.issued = [];
  state.db = new FakeSupabase({
    gift_vouchers: [],
    contacts: [
      { id: "c-anna", email: "Anna@Example.com" },
      { id: "c-dup1", email: "shared@example.com" },
      { id: "c-dup2", email: "SHARED@example.com" },
    ],
  });
});

describe("the use-by date", () => {
  it("parses a typed date, and refuses nonsense and the past", () => {
    expect(parseRedeemBy("2027-03-01", "2026-09-27")).toEqual({ ok: true, value: "2027-03-01" });
    expect(parseRedeemBy("", "2026-09-27")).toEqual({ ok: true, value: null });
    expect(parseRedeemBy(null, "2026-09-27")).toEqual({ ok: true, value: null });
    expect(parseRedeemBy("2027-02-30", "2026-09-27").ok).toBe(false);
    expect(parseRedeemBy("soon", "2026-09-27").ok).toBe(false);
    expect(parseRedeemBy("2026-01-01", "2026-09-27").ok).toBe(false);
  });

  it("defaults to 2 years for every voucher, whatever its amount or trip", () => {
    expect(VOUCHER_VALID_MONTHS).toBe(24);
    expect(redeemByFrom("2026-09-27T10:00:00Z")).toBe("2028-09-27");
  });

  it("activation writes 2 years for a small trip voucher and a big any-trip one alike", async () => {
    const today = new Date().toISOString();
    const expected = redeemByFrom(today);
    for (const [id, amount, experience_id] of [["small", 400, "ex1"], ["big", 6000, null]] as const) {
      state.db.rows("gift_vouchers").push({ id, code: `NP7-${id}`, status: "pending", amount, experience_id, paid_at: null, redeem_by: null, recipient_contact_id: null });
      await PATCH(req({ action: "activate" }), ctx(id));
    }
    expect(state.db.rows("gift_vouchers").map((v) => v.redeem_by)).toEqual([expected, expected]);
    expect(Number(expected.slice(0, 4)) - Number(today.slice(0, 4))).toBe(2);
  });

  it("New voucher honours the date the team typed", async () => {
    const res = await POST(req({ amount: 300, activate: true, redeem_by: "2027-03-01" }));
    expect(res.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ status: "active", redeem_by: "2027-03-01" });
  });

  it("New voucher without a date still gets the default", async () => {
    await POST(req({ amount: 300, activate: true, redeem_by: null }));
    const expected = redeemByFrom(new Date().toISOString());
    expect(state.db.rows("gift_vouchers")[0].redeem_by).toBe(expected);
  });

  it("New voucher refuses a date in the past instead of saving it", async () => {
    const res = await POST(req({ amount: 300, activate: true, redeem_by: "2020-01-01" }));
    expect(res.status).toBe(400);
    expect(state.db.rows("gift_vouchers")).toHaveLength(0);
  });

  it("a pending voucher keeps its typed date when it is activated later", async () => {
    await POST(req({ amount: 300, activate: false, redeem_by: "2027-03-01" }));
    const v = state.db.rows("gift_vouchers")[0];
    expect(v).toMatchObject({ status: "pending", redeem_by: "2027-03-01" });
    const res = await PATCH(req({ action: "activate" }), ctx(String(v.id)));
    expect(res.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ status: "active", redeem_by: "2027-03-01" });
  });
});

describe("activation puts the voucher in the recipient's account", () => {
  const pending = (over: Row): Row => ({ id: "v1", code: "NP7-AAAA-BBBB", status: "pending", amount: 400, experience_id: null, paid_at: null, redeem_by: null, recipient_contact_id: null, ...over });

  it("picks the one contact on that address, whatever its case", () => {
    expect(soleContactId([{ id: "a", email: "Anna@Example.com" }], "anna@example.com")).toBe("a");
    expect(soleContactId([{ id: "a", email: "x@y.z" }, { id: "b", email: "X@y.z" }], "x@y.z")).toBeNull();
    expect(soleContactId([], "x@y.z")).toBeNull();
  });

  it("links it on activation when exactly one contact matches", async () => {
    state.db.rows("gift_vouchers").push(pending({ recipient_email: "anna@example.com" }));
    const res = await PATCH(req({ action: "activate" }), ctx("v1"));
    expect(res.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ status: "active", recipient_contact_id: "c-anna" });
    expect(state.issued).toEqual(["v1"]);
  });

  it("leaves it unlinked when two contacts share the address", async () => {
    state.db.rows("gift_vouchers").push(pending({ recipient_email: "shared@example.com" }));
    await PATCH(req({ action: "activate" }), ctx("v1"));
    expect(state.db.rows("gift_vouchers")[0].recipient_contact_id).toBeNull();
  });

  it("does not link it while Nico is still to call them: the call is the news", async () => {
    state.db.rows("gift_vouchers").push(pending({ recipient_email: "anna@example.com", nico_call: true }));
    const res = await PATCH(req({ action: "activate" }), ctx("v1"));
    expect(res.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ status: "active", recipient_contact_id: null });
  });

  it("New voucher, activated straight away, links it too", async () => {
    await POST(req({ amount: 300, activate: true, recipient_email: "anna@example.com" }));
    expect(state.db.rows("gift_vouchers")[0].recipient_contact_id).toBe("c-anna");
  });
});

describe("a partly used voucher", () => {
  it("keeps its amount; other fields stay editable", async () => {
    state.db.rows("gift_vouchers").push({ id: "v1", status: "active", amount: 10000, balance: 7610, notes: null, recipient_name: "Anna" });
    const refused = await PATCH(req({ action: "update", fields: { amount: 12000 } }), ctx("v1"));
    expect(refused.status).toBe(400);
    expect(state.db.rows("gift_vouchers")[0].amount).toBe(10000);

    // The edit form always sends the amount back unchanged; that must not block a note.
    const ok = await PATCH(req({ action: "update", fields: { amount: "10000", notes: "called Anna" } }), ctx("v1"));
    expect(ok.status).toBe(200);
    expect(state.db.rows("gift_vouchers")[0]).toMatchObject({ amount: 10000, balance: 7610, notes: "called Anna" });
  });
});
