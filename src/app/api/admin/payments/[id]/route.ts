/**
 * /api/admin/payments/[id] — one booked row.
 *
 *   GET                                     the row with its relations
 *   POST { action: "adopt", transactionId } this hand-typed row IS that bank
 *                                           movement: link it, no new money
 *   POST { action: "mark-off-bank", reason, method? }
 *                                           this row is money the feed will
 *                                           never show; the reason is required
 *   PATCH {...}                             edit. A bank-backed row only takes
 *                                           type, notes and the invoice it is
 *                                           applied to: its amount and date
 *                                           are the bank's, not ours to type
 *   DELETE                                  remove a row. Refused for a
 *                                           bank-backed row: disconnect it on
 *                                           the feed instead, which also frees
 *                                           the movement to be matched again
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { settleInvoices } from "@/lib/invoices/generate";
import { promoteProformaIfPaid } from "@/lib/invoices/promote";
import { requireAdminGate, getRequestMember } from "@/lib/admin-auth";
import { adoptTransaction, markOffBank } from "@/lib/bank/adopt";

/* The untyped service client, as the feed's routes use: the generated
   Database types predate provenance / off_bank_reason / bank_transaction_id
   (migrations 233 and 235) and refuse the columns this route is about. */
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Editing or removing a payment changes which invoices it covers — see
    settleInvoices. Best-effort and after the response: the ledger is the
    record, the stamps are a reading of it. */
function resettle(bookingId: string | null | undefined) {
  if (!bookingId) return;
  /*
   * Promotion belongs here too. It ran on CREATE only, so a payment corrected
   * afterwards — or one imported straight into the table — left its pro-forma
   * standing as a payment request that had already been met. Jens Hahn paid
   * €3,184.50 against PF-…-0EDA5F-DP on 30 August and no tax invoice was ever
   * issued for it, which is why every later figure on that booking came out
   * wrong: the money could not be attached to a document, so the formulas
   * netted it against whichever invoice happened to be open.
   */
  after(() => promoteProformaIfPaid(bookingId).catch((e) =>
    console.error("proforma promotion failed", e instanceof Error ? e.message : e)));
  after(() => settleInvoices(bookingId).catch((e) =>
    console.error("invoice settle failed", e instanceof Error ? e.message : e)));
}

const SELECT = "*, exp_bookings(name, status), contacts(name), vendors(name), exp_experiences(title), bank_transactions!exp_payments_bank_transaction_id_fkey(id, source, external_id, booked_on, counterparty, amount)";

/** What may be typed onto a row, by what the row is. */
const BANK_EDITABLE = ["type", "notes", "document_id"];
const NEVER_TYPED = ["provenance", "bank_transaction_id", "id", "created_at"];

// GET /api/admin/payments/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = db();
  const { id } = await params;
  const { data, error } = await client.from("exp_payments").select(SELECT).eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// POST /api/admin/payments/:id — adopt onto a bank movement, or mark off-bank
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action ?? "");
  const member = await getRequestMember();

  if (action === "adopt") {
    const transactionId = String(body.transactionId ?? "");
    if (!transactionId) return NextResponse.json({ error: "transactionId is required." }, { status: 400 });
    const res = await adoptTransaction({ paymentId: id, transactionId, by: member?.id ?? "admin" });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, remaining: res.remaining });
  }

  if (action === "mark-off-bank") {
    const res = await markOffBank({ paymentId: id, reason: body.reason, method: body.method });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}

// PATCH /api/admin/payments/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = db();
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const { data: row } = await client.from("exp_payments").select("id, booking_id, provenance, off_bank_reason").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (NEVER_TYPED.includes(k)) continue; // the label and the link move only through adopt / disconnect
    patch[k] = v;
  }
  if (row.provenance === "bank") {
    const refused = Object.keys(patch).filter((k) => !BANK_EDITABLE.includes(k));
    if (refused.length) {
      return NextResponse.json({
        error: `This payment is a bank movement; its ${refused.join(", ")} come from the feed. Disconnect it on the Payments page if the match is wrong.`,
      }, { status: 400 });
    }
  }
  if (row.provenance === "off_bank" && "off_bank_reason" in patch && !String(patch.off_bank_reason ?? "").trim()) {
    return NextResponse.json({ error: "An off-bank payment keeps its reason. Change it, do not blank it." }, { status: 400 });
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await client
    .from("exp_payments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  resettle((data as { booking_id?: string | null } | null)?.booking_id ?? row.booking_id);
  return NextResponse.json(data);
}

// DELETE /api/admin/payments/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = db();
  const { id } = await params;
  // Read the booking before the row is gone — afterwards there is nothing to
  // re-settle against.
  const { data: row } = await client.from("exp_payments").select("booking_id, provenance").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (row.provenance === "bank") {
    return NextResponse.json({
      error: "This payment is a bank movement and is not deleted by hand. Disconnect it on the Payments page; the movement then goes back to the pile to be matched again.",
    }, { status: 400 });
  }
  const { error } = await client.from("exp_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  resettle((row as { booking_id?: string | null } | null)?.booking_id);
  return NextResponse.json({ success: true });
}
