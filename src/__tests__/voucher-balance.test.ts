/**
 * What is left on a gift voucher stays on it (Nico, 27 Sep 2026).
 *
 * A voucher used to be single-use: a €10,000 gift used on a €2,390 week threw
 * away €7,610. Now the rest is kept in gift_vouchers.balance, the voucher stays
 * active, and the same code works on the next booking until it is used up.
 * And every use writes a payment the bank queue does not ask about, because
 * no bank line will ever match it (provenance 'off_bank', migration 235).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";
import {
  fmtVoucherValue,
  splitVoucherCredit,
  voucherPartlyUsed,
  voucherPaymentRow,
  voucherValueLeft,
} from "@/lib/vouchers";

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/auth", () => ({ getPortalUser: async () => ({ contactId: "ct1", email: "rider@example.com" }) }));
vi.mock("@/lib/portal-data", () => ({
  getConfirmedAddonsTotal: async () => 0,
  getBookingPaid: async (bookingId: string) =>
    state.db.rows("exp_payments")
      .filter((p) => p.booking_id === bookingId && p.status === "paid" && p.direction === "revenue")
      .reduce((s, p) => s + Number(p.amount), 0),
}));

import { POST } from "@/app/api/portal/vouchers/redeem/route";

describe("splitting a voucher against what a trip still owes", () => {
  it("keeps what the trip does not need on the voucher", () => {
    expect(splitVoucherCredit(10000, 2390)).toEqual({ applied: 2390, left: 7610, status: "active" });
  });

  it("is used up when the trip needs all of it", () => {
    expect(splitVoucherCredit(7610, 9000)).toEqual({ applied: 7610, left: 0, status: "redeemed" });
    expect(splitVoucherCredit(500, 500)).toEqual({ applied: 500, left: 0, status: "redeemed" });
  });

  it("keeps cents exactly, and treats a cent or less as spent", () => {
    expect(splitVoucherCredit(10000, 5864.23)).toEqual({ applied: 5864.23, left: 4135.77, status: "active" });
    expect(splitVoucherCredit(2390.01, 2390)).toEqual({ applied: 2390, left: 0, status: "redeemed" });
  });

  it("applies the whole value when the booking has no price yet", () => {
    expect(splitVoucherCredit(1000, null)).toEqual({ applied: 1000, left: 0, status: "redeemed" });
  });

  it("reads what is left: the balance once used, else the amount", () => {
    expect(voucherValueLeft({ amount: 10000, balance: null })).toBe(10000);
    expect(voucherValueLeft({ amount: 10000 })).toBe(10000);
    expect(voucherValueLeft({ amount: 10000, balance: 7610 })).toBe(7610);
    expect(voucherValueLeft({ amount: 10000, balance: 0 })).toBe(0);
    expect(voucherPartlyUsed({ amount: 10000, balance: 7610 })).toBe(true);
    expect(voucherPartlyUsed({ amount: 10000, balance: null })).toBe(false);
    expect(voucherPartlyUsed({ amount: 10000, balance: 0 })).toBe(false);
  });

  it("writes money the way every voucher surface does, cents only when there are any", () => {
    expect(fmtVoucherValue(7610)).toBe("€7,610");
    expect(fmtVoucherValue(4135.77)).toBe("€4,135.77");
  });
});

describe("the payment a voucher use writes", () => {
  const row = voucherPaymentRow({
    bookingId: "bk1", contactId: "ct1", experienceId: "ex1", code: "NP7-AAAA-BBBB",
    applied: 2390, valueBefore: 10000, left: 7610, currency: "EUR", at: "2026-09-27T10:00:00.000Z",
  });

  it("is off-bank with a reason, so it never lands in the unverified bank queue", () => {
    expect(row.provenance).toBe("off_bank");
    expect(row.off_bank_reason).toBe("Gift voucher NP7-AAAA-BBBB");
    expect(row.method).toBe("voucher");
    expect(row.status).toBe("paid");
    expect(row.direction).toBe("revenue");
    expect(row.amount).toBe(2390);
    expect(row.notes).toContain("€7,610 left on the voucher");
  });
});

const voucher = (over: Row = {}): Row => ({
  id: "v1",
  code: "NP7-AAAA-BBBB",
  status: "active",
  amount: 10000,
  currency: "EUR",
  experience_id: null,
  redeem_by: "2099-01-01",
  recipient_contact_id: null,
  redeemed_booking_id: null,
  redeemed_at: null,
  notes: null,
  ...over,
});

function setup(v: Row = voucher()): FakeSupabase {
  state.db = new FakeSupabase({
    exp_bookings: [
      { id: "bk1", contact_id: "ct1", experience_id: "ex1", agreed_price: 2390 },
      { id: "bk2", contact_id: "ct1", experience_id: "ex1", agreed_price: 9000 },
    ],
    gift_vouchers: [v],
    exp_payments: [],
  });
  return state.db;
}

async function redeem(bookingId: string, code = "NP7-AAAA-BBBB") {
  const req = { json: async () => ({ code, bookingId }) } as unknown as Request;
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("redeeming a voucher on a booking", () => {
  beforeEach(() => setup());

  it("a €10,000 voucher on a €2,390 week keeps €7,610 and stays active", async () => {
    const r = await redeem("bk1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, amount: 2390, left: 7610 });

    const v = state.db.rows("gift_vouchers")[0];
    expect(v.status).toBe("active");
    expect(v.balance).toBe(7610);
    expect(v.redeemed_booking_id).toBe("bk1");
    expect(v.recipient_contact_id).toBe("ct1");
    expect(String(v.notes)).toContain("€2,390 used on booking bk1");

    const pays = state.db.rows("exp_payments");
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({
      booking_id: "bk1", amount: 2390, method: "voucher", reference: "NP7-AAAA-BBBB",
      provenance: "off_bank", off_bank_reason: "Gift voucher NP7-AAAA-BBBB",
    });
  });

  it("the same code then spends the rest on the next booking, and is used up", async () => {
    await redeem("bk1");
    const r = await redeem("bk2");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ amount: 7610, left: 0 });
    const v = state.db.rows("gift_vouchers")[0];
    expect(v.status).toBe("redeemed");
    expect(v.balance).toBe(0);
    expect(v.redeemed_booking_id).toBe("bk2");
    expect(state.db.rows("exp_payments").map((p) => p.amount)).toEqual([2390, 7610]);

    const again = await redeem("bk2");
    expect(again.status).toBe(409);
    expect(String(again.body.error)).toMatch(/used up/);
  });

  it("refuses a booking that is already paid, without touching the voucher", async () => {
    await redeem("bk1");
    const r = await redeem("bk1");
    expect(r.status).toBe(409);
    expect(state.db.rows("gift_vouchers")[0].balance).toBe(7610);
    expect(state.db.rows("exp_payments")).toHaveLength(1);
  });

  it("does not spend value somebody else just spent (the balance moved under it)", async () => {
    // Another tab used €500 between our read and our write: the claim must
    // match nothing rather than overwrite that use.
    const db = setup(voucher({ balance: 1000 }));
    const realFrom = db.from.bind(db);
    let reads = 0;
    db.from = ((table: string) => {
      const q = realFrom(table);
      if (table === "gift_vouchers" && reads++ === 0) {
        const origMaybe = q.maybeSingle.bind(q);
        q.maybeSingle = async () => {
          const out = await origMaybe();
          db.rows("gift_vouchers")[0].balance = 500;
          return out;
        };
      }
      return q;
    }) as typeof db.from;

    const r = await redeem("bk1");
    expect(r.status).toBe(409);
    expect(db.rows("exp_payments")).toHaveLength(0);
    expect(db.rows("gift_vouchers")[0].balance).toBe(500);
  });

  it("puts the voucher back when the payment cannot be written", async () => {
    const db = setup();
    db.failOn("exp_payments", "insert", { message: "insert failed" });
    const r = await redeem("bk1");
    expect(r.status).toBe(400);
    const v = db.rows("gift_vouchers")[0];
    expect(v.status).toBe("active");
    expect(v.balance ?? null).toBeNull();
    expect(v.redeemed_booking_id).toBeNull();
    expect(v.recipient_contact_id).toBeNull();
  });

  it("still refuses an expired voucher and one for another trip", async () => {
    setup(voucher({ redeem_by: "2020-01-01" }));
    expect((await redeem("bk1")).status).toBe(409);
    expect(state.db.rows("gift_vouchers")[0].status).toBe("expired");

    setup(voucher({ experience_id: "ex-other" }));
    const r = await redeem("bk1");
    expect(r.status).toBe(409);
    expect(state.db.rows("exp_payments")).toHaveLength(0);
  });
});
