import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics — business dashboard aggregates from existing data
 * (bookings, payments, editions). No tracking, no consent needed. Owner-only
 * (middleware gates /api/admin/analytics).
 */
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  const [bookingsRes, paymentsRes, editionsRes] = await Promise.all([
    db.from("exp_bookings").select("id, status, agreed_price, downpayment_received, final_payment_received, edition_id"),
    db.from("exp_payments").select("amount, status, direction, booking_id"),
    db.from("exp_editions").select("id, label, year, date_start, max_spots, spots_taken, exp_experiences(title)").gte("date_start", today).order("date_start", { ascending: true }).limit(12),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data || []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRes.data || []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editions = (editionsRes.data || []) as any[];

  // Cash received per booking (exclude cancelled/refunded/void + outgoing/vendor payments).
  const receivedByBooking: Record<string, number> = {};
  let receivedTotal = 0;
  for (const p of payments) {
    if (p.status === "cancelled" || p.status === "refunded" || p.status === "void") continue;
    if (p.direction === "out" || p.direction === "outgoing") continue;
    const amt = Number(p.amount) || 0;
    if (p.booking_id) receivedByBooking[p.booking_id] = (receivedByBooking[p.booking_id] || 0) + amt;
    receivedTotal += amt;
  }

  const DEAD = new Set(["lost", "cancelled"]);
  const depositStatuses = new Set(["downpayment_paid", "paid", "confirmed", "attended"]);
  const balanceStatuses = new Set(["paid", "attended"]);

  let active = 0, leads = 0, depositOnly = 0, balancePaid = 0, lost = 0, expected = 0;
  const byEdition: Record<string, { booked: number; received: number; count: number }> = {};

  for (const b of bookings) {
    const status = (b.status || "").toLowerCase();
    if (DEAD.has(status)) { lost++; continue; }
    active++;
    const price = Number(b.agreed_price) || 0;
    expected += price;
    const dep = b.downpayment_received === true || depositStatuses.has(status);
    const bal = b.final_payment_received === true || balanceStatuses.has(status);
    if (bal) balancePaid++; else if (dep) depositOnly++; else leads++;
    if (b.edition_id) {
      const e = (byEdition[b.edition_id] ||= { booked: 0, received: 0, count: 0 });
      e.booked += price;
      e.received += receivedByBooking[b.id] || 0;
      e.count++;
    }
  }

  const round = (n: number) => Math.round(n);
  const editionsOut = editions.map((e) => {
    const agg = byEdition[e.id] || { booked: 0, received: 0, count: 0 };
    const max = Number(e.max_spots) || 0;
    const taken = Number(e.spots_taken) || agg.count;
    return {
      id: e.id,
      title: e.exp_experiences?.title || "—",
      label: e.label || (e.year ? String(e.year) : ""),
      date_start: e.date_start,
      max_spots: max,
      spots_taken: taken,
      fill_pct: max > 0 ? Math.round((taken / max) * 100) : null,
      booked: round(agg.booked),
      received: round(agg.received),
    };
  });

  return NextResponse.json({
    funnel: { reserved: active, depositPaid: depositOnly + balancePaid, balancePaid },
    totals: { active, leads, lost, upcomingEditions: editions.length },
    revenue: { received: round(receivedTotal), expected: round(expected), outstanding: round(Math.max(0, expected - receivedTotal)) },
    editions: editionsOut,
  });
}
