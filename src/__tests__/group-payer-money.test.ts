/**
 * A group payer's money is pooled like their price.
 *
 * Jana Heinen paid EUR 10,448.25 for herself and Niklas. The team then moved
 * 2,990 of it onto Niklas's booking so his own revenue shows. Her trip page
 * kept billing Niklas's price but only counted the money on her own booking,
 * so she read as owing 2,990 with a Pay button for it, and the next money-status
 * sync would have knocked her from "paid" back to "confirmed" (Nico, 6 Oct 2026).
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { FakeSupabase } from "./stubs/fake-supabase";
import { coveredReceivedTotal, coveredExtraTotal } from "@/lib/group-booking";
import { syncBookingMoneyStatus } from "@/lib/booking-money-status";

const JANA = "jana-booking";
const NIKLAS = "niklas-booking";

function janaCase() {
  return new FakeSupabase({
    exp_bookings: [
      { id: JANA, status: "paid", agreed_price: 5550, deposit_received: false, downpayment_received: true, final_payment_received: true, covered_by_booking_id: null },
      { id: NIKLAS, status: "paid", agreed_price: 2990, deposit_received: false, downpayment_received: true, final_payment_received: true, covered_by_booking_id: JANA },
    ],
    exp_booking_addons: [
      { booking_id: JANA, price: 1908.25, status: "confirmed", notes: null, payment_mode: "np7" },
    ],
    exp_payments: [
      { booking_id: JANA, amount: 4413, direction: "revenue", type: "downpayment", status: "paid" },
      { booking_id: JANA, amount: 6035.25, direction: "revenue", type: "partial", status: "paid" },
      { booking_id: JANA, amount: -2990, direction: "revenue", type: "partial", status: "paid" },
      { booking_id: NIKLAS, amount: 2990, direction: "revenue", type: "partial", status: "paid" },
    ],
  });
}

describe("a group payer whose payment was split onto a companion", () => {
  it("counts the money on the companion's booking", async () => {
    const db = janaCase();
    expect(await coveredExtraTotal(db, JANA)).toBe(2990);
    expect(await coveredReceivedTotal(db, JANA)).toBe(2990);
  });

  it("is still fully paid, so the status sync changes nothing", async () => {
    const db = janaCase();
    const res = await syncBookingMoneyStatus(db as never, JANA);
    expect(res?.total).toBe(10448.25);
    expect(res?.received).toBe(10448.25);
    expect(res?.changed).toBeNull();
  });

  it("a payer nobody moved money for is unaffected", async () => {
    const db = new FakeSupabase({
      exp_bookings: [{ id: "solo", status: "confirmed", agreed_price: 2000, deposit_received: false, downpayment_received: true, final_payment_received: false, covered_by_booking_id: null }],
      exp_booking_addons: [],
      exp_payments: [{ booking_id: "solo", amount: 1000, direction: "revenue", type: "downpayment", status: "paid" }],
    });
    expect(await coveredReceivedTotal(db, "solo")).toBe(0);
    const res = await syncBookingMoneyStatus(db as never, "solo");
    expect(res?.received).toBe(1000);
    expect(res?.changed).toBeNull();
  });
});
