/**
 * /api/admin/bookings/[id]/payments — one booking's money.
 *
 *   GET      the rows, each bank-backed one carrying the movement it came from
 *   POST     record an OFF-BANK payment on this booking. Since 2026-09-13 this
 *            is the only thing the form on the booking page can write: money
 *            that will never be in the feed (cash, wired to Surfcenter, offset,
 *            other), with a mandatory reason. Money that IS in the feed is
 *            connected, not typed: see ./bank.
 *   PATCH    edit a row. A bank-backed row only takes type, notes and the
 *            invoice it is applied to.
 *   DELETE   remove a row, or both sides of an allocation pair. A bank-backed
 *            row is refused: disconnect it on the Payments page instead.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, after } from "next/server";
import { requireAdminGate, getRequestMember } from "@/lib/admin-auth";
import { settleInvoices } from "@/lib/invoices/generate";
import { describePromotion } from "@/lib/invoices/promotion-note";
import { recordOffBankPayment } from "@/lib/bank/adopt";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const { id } = await params;
  const admin = getServiceClient();

  const { data, error } = await admin
    .from("exp_payments")
    .select("*")
    .eq("booking_id", id)
    .order("received_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The movement behind each bank-backed row, read flat: there are two
  // foreign keys between these tables and a bare embed is ambiguous.
  const txIds = [...new Set((data ?? []).map((p) => p.bank_transaction_id).filter(Boolean))] as string[];
  const txById = new Map<string, Record<string, unknown>>();
  if (txIds.length) {
    const { data: txs } = await admin
      .from("bank_transactions")
      .select("id, source, external_id, booked_on, amount, counterparty, reference")
      .in("id", txIds);
    for (const t of txs ?? []) txById.set(String(t.id), t);
  }
  const payments = (data ?? []).map((p) => ({
    ...p,
    transaction: p.bank_transaction_id ? txById.get(String(p.bank_transaction_id)) ?? null : null,
  }));
  return Response.json({ payments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const member = await getRequestMember();

  const res = await recordOffBankPayment({
    bookingId: id,
    documentId: typeof body.document_id === "string" ? body.document_id : typeof body.documentId === "string" ? body.documentId : null,
    amount: body.amount,
    date: body.date,
    method: body.method,
    reason: body.reason ?? body.off_bank_reason,
    refund: body.refund === true || body.type === "refund",
    notes: body.notes,
    by: member?.id ?? "admin",
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  /* Recording money can also issue the real tax invoice and email it to the
     guest. The page prints promotionNote so the person who clicked learns
     that, instead of finding out from the guest. Null when nothing else
     happened, which is the ordinary case. */
  return Response.json({ payment: res.payment, promotionNote: describePromotion(res.promotion) });
}

/**
 * DELETE /api/admin/bookings/:id/payments?paymentId=…
 *
 * A plain hand-typed row deletes on its own. Allocation rows (reference
 * `alloc#token:…` or legacy `alloc:…`) are a mirrored PAIR and must always go
 * together, or money appears or vanishes on the other booking. A bank-backed
 * row is never deleted from here.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const paymentId = new URL(request.url).searchParams.get("paymentId");
  if (!paymentId) return Response.json({ error: "paymentId missing" }, { status: 400 });

  const admin = getServiceClient();
  const { data: row } = await admin
    .from("exp_payments")
    .select("id, booking_id, amount, reference, received_at, provenance")
    .eq("id", paymentId)
    .single();
  if (!row || row.booking_id !== id) return Response.json({ error: "Payment not found" }, { status: 404 });
  if (row.provenance === "stripe") {
    return Response.json({ error: "This payment is a Stripe charge. Refund it in Stripe; the row stays as the record of the charge." }, { status: 400 });
  }
  if (row.provenance === "bank") {
    return Response.json({
      error: "This payment is a bank movement and is not deleted by hand. Disconnect it on the Payments page; the movement then goes back to the pile.",
    }, { status: 400 });
  }
  const ref: string = row.reference || "";
  if (!/^alloc[#:]/.test(ref)) {
    const { error } = await admin.from("exp_payments").delete().eq("id", row.id);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    // Taking money back out has to un-settle whatever it was covering, or the
    // invoice keeps claiming it was paid by a row that no longer exists.
    after(() => settleInvoices(id).catch((e) =>
      console.error("invoice settle failed", e instanceof Error ? e.message : e)
    ));
    return Response.json({ ok: true, removed: 1 });
  }

  const ids = [row.id];
  const tok = ref.match(/^alloc#([a-z0-9]+):/);
  if (tok) {
    // token pair — both sides share the token
    const { data: pair } = await admin.from("exp_payments").select("id").like("reference", `alloc#${tok[1]}:%`);
    for (const p of pair ?? []) if (!ids.includes(p.id)) ids.push(p.id);
  } else {
    // legacy hand-made pair — find the opposite-signed mirror (same absolute
    // amount, alloc: reference, same day when dates exist)
    const { data: cands } = await admin
      .from("exp_payments")
      .select("id, amount, reference, received_at")
      .like("reference", "alloc:%")
      .neq("id", row.id);
    const day = (v: string | null) => (v ? String(v).slice(0, 10) : null);
    const mirror = (cands ?? []).find(
      (c) =>
        Math.abs(Number(c.amount) + Number(row.amount)) < 0.01 &&
        (day(c.received_at) === null || day(row.received_at) === null || day(c.received_at) === day(row.received_at))
    );
    if (mirror) ids.push(mirror.id);
  }

  const { error } = await admin.from("exp_payments").delete().in("id", ids);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ removed: ids.length });
}

/** Edit one payment row. Allocation rows are mirrored pairs and stay read-only:
 *  changing one side alone would silently move money on another booking. A
 *  bank-backed row keeps the bank's amount, date and method. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : null;
  if (!paymentId) return Response.json({ error: "paymentId missing" }, { status: 400 });

  const admin = getServiceClient();
  const { data: row } = await admin
    .from("exp_payments")
    .select("id, booking_id, reference, provenance")
    .eq("id", paymentId)
    .single();
  if (!row || row.booking_id !== id) return Response.json({ error: "Payment not found" }, { status: 404 });
  if (/^alloc[#:]/.test(row.reference || "")) {
    return Response.json({ error: "Allocation rows are a mirrored pair — remove it and re-allocate instead." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const n = Number(body.amount);
    if (!Number.isFinite(n)) return Response.json({ error: "Amount must be a number." }, { status: 400 });
    patch.amount = n;
  }
  for (const f of ["type", "status", "direction", "method", "reference", "notes", "document_id", "off_bank_reason"] as const) {
    if (body[f] !== undefined) patch[f] = body[f] === "" ? null : body[f];
  }
  if (row.provenance === "bank") {
    const refused = Object.keys(patch).filter((k) => !["type", "notes", "document_id"].includes(k));
    if (refused.length) {
      return Response.json({ error: `This payment is a bank movement; its ${refused.join(", ")} come from the feed. Disconnect it on the Payments page if the match is wrong.` }, { status: 400 });
    }
  }
  if (row.provenance === "off_bank" && "off_bank_reason" in patch && !patch.off_bank_reason) {
    return Response.json({ error: "An off-bank payment keeps its reason. Change it, do not blank it." }, { status: 400 });
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await admin.from("exp_payments").update(patch).eq("id", paymentId).select().single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  after(() => settleInvoices(id).catch((e) =>
    console.error("invoice settle failed", e instanceof Error ? e.message : e)
  ));
  return Response.json({ payment: data });
}
