import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, after } from "next/server";
import { isActiveTeamMember, requireAdminGate } from "@/lib/admin-auth";
import { promoteProformaIfPaid } from "@/lib/invoices/promote";
import { settleInvoices } from "@/lib/invoices/generate";
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
  return user;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = getServiceClient();

  const { data, error } = await admin
    .from("exp_payments")
    .select("*")
    .eq("booking_id", id)
    .order("received_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ payments: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const admin = getServiceClient();

  /*
   * The same transfer, written down twice.
   *
   * Statement lines 229 (€3,765) and 233 (€2,445) were each recorded here by
   * hand AND imported again from the accounting sheet, so €6,210 of Bonaire
   * revenue counted twice — and nobody noticed, because the import's copy
   * carried no booking and sat in the unmatched pile while still summing into
   * revenue and the edition P&L. The database cannot stop this: `reference` is
   * also the box a bank line number goes in, and those legitimately repeat
   * (migration 165 narrowed the unique index to Stripe intents for exactly
   * that reason). So ask the person who is looking at the statement.
   */
  const ref = String(body?.reference ?? "").trim();
  if (ref && !ref.startsWith("pi_") && !body?.confirmDuplicate) {
    const { data: same } = await admin
      .from("exp_payments").select("id").eq("reference", ref).eq("amount", body.amount).limit(1);
    if ((same as { id: string }[] | null)?.length) {
      return Response.json({
        error: `A payment with reference "${ref}" for the same amount is already recorded. If this really is a second transfer, save it again to confirm.`,
        needsConfirm: true,
      }, { status: 409 });
    }
  }
  delete body.confirmDuplicate;

  let { data, error } = await admin
    .from("exp_payments")
    .insert({ ...body, booking_id: id })
    .select()
    .single();

  // Pre-migration-054 fallback: drop the invoice link if the column is missing.
  if (error && /document_id/.test(error.message || "")) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { document_id: _docId, ...rest } = body;
    ({ data, error } = await admin
      .from("exp_payments")
      .insert({ ...rest, booking_id: id })
      .select()
      .single());
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Money landed → if it covers the pro-forma, the real tax invoice is issued,
  // allocations move over, the pro-forma is voided and the customer gets the
  // invoice by email. Background + best-effort: recording never blocks on it.
  after(() => promoteProformaIfPaid(id).catch((e) =>
    console.error("proforma promotion failed", e instanceof Error ? e.message : e)
  ));
  after(() => settleInvoices(id).catch((e) =>
    console.error("invoice settle failed", e instanceof Error ? e.message : e)
  ));

  return Response.json({ payment: data });
}

/**
 * DELETE /api/admin/bookings/:id/payments?paymentId=…
 *
 * Allocation rows ONLY (reference `alloc#token:…` or legacy `alloc:…`) — real
 * bank payments stay undeletable here. Removing one side of a pair removes the
 * mirror too, so the money flows back to the source booking cleanly.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const paymentId = new URL(request.url).searchParams.get("paymentId");
  if (!paymentId) return Response.json({ error: "paymentId missing" }, { status: 400 });

  const admin = getServiceClient();
  const { data: row } = await admin
    .from("exp_payments")
    .select("id, booking_id, amount, reference, received_at")
    .eq("id", paymentId)
    .single();
  if (!row || row.booking_id !== id) return Response.json({ error: "Payment not found" }, { status: 404 });
  const ref: string = row.reference || "";
  // A plain payment row deletes on its own. (Allocations below are a mirrored
  // PAIR and must always go together, or money appears or vanishes on the other
  // booking.) Correcting the ledger from the booking it belongs to is the whole
  // point — a wrong row used to be untouchable from here.
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
 *  changing one side alone would silently move money on another booking. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : null;
  if (!paymentId) return Response.json({ error: "paymentId missing" }, { status: 400 });

  const admin = getServiceClient();
  const { data: row } = await admin
    .from("exp_payments")
    .select("id, booking_id, reference")
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
  for (const f of ["type", "status", "direction", "method", "reference", "notes", "document_id"] as const) {
    if (body[f] !== undefined) patch[f] = body[f] === "" ? null : body[f];
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await admin.from("exp_payments").update(patch).eq("id", paymentId).select().single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ payment: data });
}
