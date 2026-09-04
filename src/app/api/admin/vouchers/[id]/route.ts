import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { createAdminClient } from "@/lib/supabase";
import { sendVoucherIssued } from "@/lib/vouchers/notify";
import { requireAdminGate } from "@/lib/admin-auth";
// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

function isMissingTable(message?: string | null) {
  return !!message && /(gift_vouchers|relation|schema cache|does not exist)/i.test(message);
}

// ─── PATCH /api/admin/vouchers/[id] ────────────────────────────────────────────
// Body: { action: "activate" | "cancel" | "update", fields?: {...} }
//   activate → payment confirmed: status active, issued + redeem_by (= +1 year)
//   cancel   → status cancelled
//   update   → edit voucher fields; a REDEEMED voucher only accepts notes,
//              because its money already sits on a booking as a payment row.
const EDITABLE = ["amount", "recipient_name", "recipient_email", "experience_id", "message", "notes", "redeem_by"] as const;

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body: { action?: string; fields?: Record<string, unknown> } = await request.json().catch(() => ({}));
  const action = body.action;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const now = new Date().toISOString();
  let updates: Record<string, unknown>;

  if (action === "update") {
    const { data: existing } = await db.from("gift_vouchers").select("status").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
    const fields = body.fields ?? {};
    const allowed = existing.status === "redeemed" ? (["notes"] as readonly string[]) : EDITABLE;
    updates = {};
    for (const k of allowed) if (k in fields) updates[k] = fields[k] === "" ? null : fields[k];
    if ("amount" in updates) {
      const amount = Number(updates.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "A voucher needs a positive amount." }, { status: 400 });
      }
      updates.amount = amount;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: existing.status === "redeemed" ? "A redeemed voucher only accepts note edits — its value is already on a booking." : "Nothing to update." },
        { status: 400 }
      );
    }
  } else if (action === "activate") {
    // Confirm the bank transfer and start the 1-year validity clock.
    const { data: existing } = await db
      .from("gift_vouchers")
      .select("paid_at, status, amount, experience_id")
      .eq("id", id)
      .maybeSingle();
    if (existing && !["pending", "active"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Can't activate a voucher that is "${existing.status}".` },
        { status: 409 }
      );
    }
    // Validity: 1 year. Value vouchers (not tied to a specific experience) over
    // €5,000 get 2 years — a trip-specific voucher is always 1 year.
    const months = Number(existing?.amount) > 5000 && !existing?.experience_id ? 24 : 12;
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
      { error: `Invalid action "${action ?? ""}". Must be "activate", "cancel" or "update".` },
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
    const origin = publicOrigin();
    await sendVoucherIssued(id, origin).catch(() => {});
  }

  return NextResponse.json({ ok: true, voucher: data });
}

// ─── DELETE /api/admin/vouchers/[id] ───────────────────────────────────────────
// Hard delete, but only for vouchers that never touched money: pending, cancelled
// or expired, AND never redeemed against a booking. An active voucher must be
// cancelled first (deliberate two-step — it may already be printed and gifted);
// a redeemed one is a money record and never deletable.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: v } = await db
    .from("gift_vouchers").select("status, redeemed_booking_id").eq("id", id).maybeSingle();
  if (!v) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
  if (v.redeemed_booking_id || v.status === "redeemed") {
    return NextResponse.json(
      { error: "This voucher was redeemed against a booking — it's a money record and can't be deleted." },
      { status: 409 }
    );
  }
  if (!["pending", "cancelled", "expired"].includes(v.status)) {
    return NextResponse.json(
      { error: `An ${v.status} voucher may already be printed and gifted — cancel it first, then delete.` },
      { status: 409 }
    );
  }

  const { error } = await db.from("gift_vouchers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
