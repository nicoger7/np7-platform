/**
 * /api/admin/payments — the booked rows, and the one door left for money
 * that is not in the feed.
 *
 *   GET  ?provenance=bank|off_bank|unverified|legacy   the rows, by kind
 *        &suggest=1 (unverified only)                  each with the feed's
 *                                                      best guess beside it
 *        ?booking_id= ?experience_id= ?status=         as before
 *
 *   POST { bookingId | documentId, amount, date, method, reason, refund? }
 *        Record an OFF-BANK payment: cash, wired to Surfcenter, offset, other.
 *        The reason is mandatory and the table refuses the row without it
 *        (migration 235). Provenance is 'off_bank', always.
 *
 * The free-form POST that took any column and wrote it is gone. It was the
 * door the €6,210 double entry came through, and since 2026-09-13 a payment
 * is either a bank movement connected on the feed or an off-bank row with a
 * written reason. There is no third kind to create.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminGate, getRequestMember } from "@/lib/admin-auth";
import { loadUnverifiedQueue, recordOffBankPayment } from "@/lib/bank/adopt";

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

const PROVENANCES = ["bank", "off_bank", "unverified", "legacy"];

// GET /api/admin/payments — list payments with related data
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = db();
  const { searchParams } = new URL(request.url);

  const bookingId = searchParams.get("booking_id");
  const experienceId = searchParams.get("experience_id");
  const status = searchParams.get("status");
  const provenance = searchParams.get("provenance");
  if (provenance && !PROVENANCES.includes(provenance)) {
    return NextResponse.json({ error: `provenance must be one of ${PROVENANCES.join(", ")}.` }, { status: 400 });
  }

  // The work queue: hand-typed rows since the switch, each with the credits
  // that could be it. Computed on read, never stored, never applied.
  if (provenance === "unverified" && searchParams.get("suggest") === "1") {
    const queue = await loadUnverifiedQueue();
    return NextResponse.json(queue);
  }

  let query = client
    .from("exp_payments")
    /* The bank embed names its foreign key: bank_transactions also points
       back here through payment_id, and PostgREST refuses the bare form with
       PGRST201 (probed 2026-09-13). */
    .select(
      "*, exp_bookings(name, status), contacts(name), vendors(name), exp_experiences(title), bank_transactions!exp_payments_bank_transaction_id_fkey(id, source, external_id, booked_on, counterparty, amount)"
    )
    // Newest first. Ordering by `date` alone buried every recent payment: the
    // newer writers (Stripe, voucher redemption, settle) fill `received_at`
    // instead, so those rows counted as undated and sank to the bottom of a
    // newest-first list. created_at is the tiebreaker and, for those rows, the
    // real recency signal — the client re-sorts on the same effective date the
    // list displays.
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (bookingId) query = query.eq("booking_id", bookingId);
  if (experienceId) query = query.eq("experience_id", experienceId);
  if (status) query = query.eq("status", status);
  if (provenance) query = query.eq("provenance", provenance);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(flagDuplicates(data ?? []));
}

/**
 * Mark the rows that look like the same money entered twice.
 *
 * The database deliberately cannot stop this. `reference` is the box someone
 * types a bank-statement line number into, and "233" repeats legitimately
 * across years and accounts — migration 165 narrowed the unique index to
 * Stripe intents for exactly that reason, after a real transfer could not be
 * recorded at all.
 *
 * But the same number for the same amount is another matter, and it happened:
 * statement lines 229 (€3,765) and 233 (€2,445) were each entered by hand on a
 * booking AND imported again from the accounting sheet, so €6,210 of Bonaire
 * revenue was counted twice. Nobody saw it, because the second copy carried no
 * booking and sat quietly in the unmatched pile while still summing into
 * revenue and the edition P&L.
 *
 * So: say so on the row. Not a block and not a deletion — which of the two is
 * the real one is a judgement about a bank statement, and that belongs to a
 * person. Rows the feed produced share a reference by design (one transfer,
 * several invoices), so those are left alone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flagDuplicates(rows: any[]): any[] {
  const seen = new Map<string, number>();
  const skip = (r: { reference?: string | null; provenance?: string | null }) => {
    const ref = String(r.reference ?? "").trim();
    return !ref || ref.startsWith("pi_") || r.provenance === "bank";
  };
  for (const r of rows) {
    if (skip(r)) continue;
    const k = `${String(r.reference).trim()}|${Number(r.amount) || 0}|${r.direction ?? ""}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    if (skip(r)) return r;
    const k = `${String(r.reference).trim()}|${Number(r.amount) || 0}|${r.direction ?? ""}`;
    return (seen.get(k) ?? 0) > 1 ? { ...r, possible_duplicate: true } : r;
  });
}

// POST /api/admin/payments — record an OFF-BANK payment (the back-door)
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const member = await getRequestMember();

  const res = await recordOffBankPayment({
    bookingId: typeof body.bookingId === "string" ? body.bookingId : typeof body.booking_id === "string" ? body.booking_id : null,
    documentId: typeof body.documentId === "string" ? body.documentId : typeof body.document_id === "string" ? body.document_id : null,
    amount: body.amount,
    date: body.date,
    method: body.method,
    reason: body.reason ?? body.off_bank_reason,
    refund: body.refund === true,
    notes: body.notes,
    by: member?.id ?? "admin",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res.payment, { status: 201 });
}
