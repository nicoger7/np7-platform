import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getBookingPaid, getConfirmedAddonsTotal } from "@/lib/portal-data";
import { sendEmail } from "@/lib/email/send";

// Admin routes are gated by middleware; no per-route auth check needed.
type RouteContext = { params: Promise<{ id: string }> };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number, c = "EUR") => new Intl.NumberFormat("en-GB", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

// ─── POST /api/admin/bookings/[id]/settle ──────────────────────────────────────
// Body: { action: "accept_short", note? }  → accept what was paid as the full price
//       { action: "remind_shortfall" }     → email the customer the remaining balance
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body: { action?: string; note?: string } = await request.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: bk } = await db
    .from("exp_bookings")
    .select("id, agreed_price, contacts(name,email), exp_experiences(title), exp_editions(date_start, date_end)")
    .eq("id", id)
    .maybeSingle();
  if (!bk) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const [paid, addons] = await Promise.all([
    getBookingPaid(id).catch(() => 0),
    getConfirmedAddonsTotal(id).catch(() => 0),
  ]);

  if (body.action === "accept_short") {
    // The trip price becomes what was actually paid → booking is settled.
    // total = agreed + add-ons, so agreed = paid − add-ons (never below 0).
    //
    // Refuse when NOTHING was paid. "Accept as settled" means "they paid a bit
    // less, call it even"; on a booking with no payment it silently rewrites
    // the trip to €0 and calls that settled — which reads in every report as a
    // free trip rather than a no-show. If someone genuinely is comped, that is
    // a price change made deliberately, not a settlement.
    if (paid <= 0) {
      return NextResponse.json({
        error: "Nothing has been paid on this booking, so there's nothing to settle — accepting would set the trip price to €0. Mark it lost, or change the price deliberately if it really is a free spot.",
      }, { status: 400 });
    }
    const newAgreed = round2(Math.max(0, paid - addons));
    const updates: Record<string, unknown> = {
      agreed_price: newAgreed,
      final_accepted_at: new Date().toISOString(),
      final_accept_note: body.note?.trim() || null,
    };
    let { error } = await db.from("exp_bookings").update(updates).eq("id", id);
    if (error && /final_accepted_at|final_accept_note/.test(error.message || "")) {
      // pre-migration-054: at least drop the agreed price to settle it
      ({ error } = await db.from("exp_bookings").update({ agreed_price: newAgreed }).eq("id", id));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, agreed_price: newAgreed });
  }

  if (body.action === "remind_shortfall") {
    const total = round2((Number(bk.agreed_price) || 0) + addons);
    const balance = round2(Math.max(0, total - paid));
    if (balance <= 0.01) return NextResponse.json({ error: "Nothing outstanding — balance is settled." }, { status: 400 });
    const email = bk.contacts?.email;
    if (!email) return NextResponse.json({ error: "No email on file for this customer." }, { status: 400 });

    // Reference = the open final invoice's number, if one exists.
    const { data: inv } = await db
      .from("documents")
      .select("invoice_number")
      .eq("booking_id", id)
      .eq("type", "final_invoice")
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .maybeSingle();

    const dates = bk.exp_editions?.date_start
      ? new Date(bk.exp_editions.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "";
    const res = await sendEmail({
      to: email,
      templateKey: "payment_shortfall_reminder",
      bookingId: id,
      vars: {
        firstName: (bk.contacts?.name ?? "").split(" ")[0] || "there",
        experienceTitle: bk.exp_experiences?.title ?? "",
        dates,
        balance: fmt(balance),
        reference: inv?.invoice_number || "",
        bookingLink: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/bookings/${id}`,
      },
    });
    return NextResponse.json({ ok: true, status: res.status, balance });
  }

  return NextResponse.json({ error: `Unknown action "${body.action ?? ""}".` }, { status: 400 });
}
