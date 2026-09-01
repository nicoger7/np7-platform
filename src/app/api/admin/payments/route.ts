import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { promoteProformaIfPaid } from "@/lib/invoices/promote";
import { settleInvoices } from "@/lib/invoices/generate";

// GET /api/admin/payments — list payments with related data
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);

  const bookingId = searchParams.get("booking_id");
  const experienceId = searchParams.get("experience_id");
  const status = searchParams.get("status");

  let query = client
    .from("exp_payments")
    .select(
      "*, exp_bookings(name, status), contacts(name), vendors(name), exp_experiences(title)"
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
 * person.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flagDuplicates(rows: any[]): any[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const ref = String(r.reference ?? "").trim();
    if (!ref || ref.startsWith("pi_")) continue; // Stripe already guarantees its own
    const k = `${ref}|${Number(r.amount) || 0}|${r.direction ?? ""}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const ref = String(r.reference ?? "").trim();
    if (!ref || ref.startsWith("pi_")) return r;
    const k = `${ref}|${Number(r.amount) || 0}|${r.direction ?? ""}`;
    return (seen.get(k) ?? 0) > 1 ? { ...r, possible_duplicate: true } : r;
  });
}

// POST /api/admin/payments — create a payment
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();

  /*
   * Catch the double entry at the moment it is made, while the person is still
   * looking at the bank statement and can tell whether this really is a second
   * transfer that happens to share a line number. Sending `confirmDuplicate`
   * says they checked; without it the save stops and explains itself.
   */
  const ref = String(body?.reference ?? "").trim();
  if (ref && !ref.startsWith("pi_") && !body?.confirmDuplicate) {
    const { data: same } = await client
      .from("exp_payments")
      .select("id, amount, date, received_at, booking_id")
      .eq("reference", ref)
      .eq("amount", body.amount)
      .limit(1);
    const hit = (same as { id: string }[] | null)?.[0];
    if (hit) {
      return NextResponse.json(
        {
          error: `A payment with reference "${ref}" for the same amount is already recorded. If this really is a second transfer, save it again to confirm.`,
          duplicateOf: hit.id,
          needsConfirm: true,
        },
        { status: 409 }
      );
    }
  }
  delete body.confirmDuplicate;

  const { data, error } = await client
    .from("exp_payments")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Pro-forma → real invoice once the securing payment is covered (see promote.ts).
  const bookingId = (data as { booking_id?: string | null })?.booking_id;
  if (bookingId) {
    after(() => promoteProformaIfPaid(bookingId).catch((e) =>
      console.error("proforma promotion failed", e instanceof Error ? e.message : e)
    ));
    // Which invoices this money settles — see settleInvoices.
    after(() => settleInvoices(bookingId).catch((e) =>
      console.error("invoice settle failed", e instanceof Error ? e.message : e)
    ));
  }

  return NextResponse.json(data, { status: 201 });
}
