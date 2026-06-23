import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendVoucherIssued } from "@/lib/vouchers/notify";

// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

function isMissingTable(message?: string | null) {
  return !!message && /(gift_vouchers|relation|schema cache|does not exist)/i.test(message);
}

// ─── PATCH /api/admin/vouchers/[id] ────────────────────────────────────────────
// Body: { action: "activate" | "cancel" }
//   activate → payment confirmed: status active, issued + redeem_by (= +1 year)
//   cancel   → status cancelled
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body: { action?: string } = await request.json().catch(() => ({}));
  const action = body.action;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const now = new Date().toISOString();
  let updates: Record<string, unknown>;

  if (action === "activate") {
    // Confirm the bank transfer and start the 1-year validity clock.
    const { data: existing } = await db
      .from("gift_vouchers")
      .select("paid_at, status, amount")
      .eq("id", id)
      .maybeSingle();
    if (existing && !["pending", "active"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Can't activate a voucher that is "${existing.status}".` },
        { status: 409 }
      );
    }
    // Validity: 1 year, or 2 years for high-value vouchers (> €5,000).
    const months = Number(existing?.amount) > 5000 ? 24 : 12;
    const rb = new Date(now);
    rb.setMonth(rb.getMonth() + months);
    updates = {
      status: "active",
      paid_at: existing?.paid_at ?? now,
      issued_at: now,
      redeem_by: rb.toISOString().slice(0, 10),
    };
  } else if (action === "cancel") {
    updates = { status: "cancelled" };
  } else {
    return NextResponse.json(
      { error: `Invalid action "${action ?? ""}". Must be "activate" or "cancel".` },
      { status: 400 }
    );
  }

  const { data, error } = await db
    .from("gift_vouchers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: "Run migration 036 first (gift_vouchers table missing)." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // On payment confirmation, email the printable PDF voucher to the buyer (and the
  // recipient if given). Best-effort + idempotent — never blocks the activation.
  if (action === "activate") {
    const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
    await sendVoucherIssued(id, origin).catch(() => {});
  }

  return NextResponse.json({ ok: true, voucher: data });
}
