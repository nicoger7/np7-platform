import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { settleInvoices } from "@/lib/invoices/generate";
import { promoteProformaIfPaid } from "@/lib/invoices/promote";

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

// GET /api/admin/payments/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { data, error } = await client
    .from("exp_payments")
    .select("*, exp_bookings(name, status), contacts(name), vendors(name), exp_experiences(title)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/admin/payments/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();
  const { data, error } = await client
    .from("exp_payments")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  resettle((data as { booking_id?: string | null } | null)?.booking_id);
  return NextResponse.json(data);
}

// DELETE /api/admin/payments/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  // Read the booking before the row is gone — afterwards there is nothing to
  // re-settle against.
  const { data: row } = await client.from("exp_payments").select("booking_id").eq("id", id).maybeSingle();
  const { error } = await client.from("exp_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  resettle((row as { booking_id?: string | null } | null)?.booking_id);
  return NextResponse.json({ success: true });
}
