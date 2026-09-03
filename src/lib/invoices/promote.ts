/**
 * Pro-forma → real invoice promotion + the rolling balance pro-forma.
 *
 * The funnel keeps ONE open PRO-FORMA per booking (payment request, PF- ref, no
 * tax number burned) = what's due next. When money arrives that covers it:
 *   1. the official tax invoice is generated (gapless number),
 *   2. payments allocated to the pro-forma are re-pointed at the real invoice,
 *   3. the pro-forma is voided (meta.superseded_by),
 *   4. the customer gets the real invoice by email (deduped), and
 *   5. if a balance remains (e.g. after the down-payment), a fresh pro-forma is
 *      issued for it — so the rider can pay the rest early. Add-ons that raised
 *      the total flow into that balance automatically.
 *
 * Loops so a pay-in-full-upfront settles every stage in one go. No payment ever →
 * the pro-forma just expires with the booking and NO Storno is ever needed. Call
 * after any payment write; idempotent and best-effort.
 */

import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { nextStepsVars } from "@/lib/email/next-steps";
import { paymentInflow } from "@/lib/reconcile";
import { generateDocument, bookingBillingTotals, issuedInvoiceTotal } from "./generate";
import type { DocumentRow } from "./types";

function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
}

export async function promoteProformaIfPaid(bookingId: string): Promise<{ promoted: boolean; documentId?: string }> {
  const db = getDb();

  // Total money in (all inflows count; refunds subtract). Constant across the loop.
  const { data: pays } = await db
    .from("exp_payments")
    .select("id, amount, type, direction, status, document_id")
    .eq("booking_id", bookingId);
  const inflow = ((pays ?? []) as { amount: number | null; type: string | null; direction: string | null; status: string | null }[])
    .reduce((s, p) => s + paymentInflow(p), 0);

  const { data: bk0 } = await db.from("exp_bookings").select("agreed_price").eq("id", bookingId).maybeSingle();
  const agreed = Number(bk0?.agreed_price ?? 0);

  let promotedAny = false;
  let lastRealId: string | undefined;

  // Settle every open pro-forma the cumulative money now covers.
  for (let guard = 0; guard < 5; guard++) {
    const { data: pf } = await db
      .from("documents")
      .select("id, amount, meta, invoice_number")
      .eq("booking_id", bookingId)
      .eq("type", "proforma_invoice")
      .eq("status", "issued")
      .maybeSingle();
    if (!pf || !pf.amount) break;

    // This pro-forma is settled once cumulative inflow covers everything already
    // real-invoiced (prior stages) PLUS this pro-forma's amount.
    const priorInvoiced = await issuedInvoiceTotal(bookingId);
    if (inflow + 0.01 < priorInvoiced + Number(pf.amount)) break;

    const milestone = pf.meta?.milestone === "deposit" ? "deposit" : pf.meta?.milestone === "final" ? "final" : "downpayment";
    const realType = milestone === "deposit" ? ("deposit_invoice" as const) : milestone === "final" ? ("final_invoice" as const) : ("downpayment_invoice" as const);

    /*
     * Already invoiced BY HAND? Then this pro-forma is a payment request for a
     * debt that a real tax invoice already documents — void it, generate
     * nothing.
     *
     * The atomic claim below only defends against two payments racing each
     * other. It cannot see the other door into the same milestone: an admin
     * pressing "Down-Payment Invoice" on the booking. Walk both doors and the
     * guest ends up with two issued invoices for one obligation (a walkthrough
     * on 1 Sep 2026 produced #0040 and #0041, EUR 1,435 each, for a single
     * EUR 1,435 down-payment). Two tax invoices for one debt is a real
     * bookkeeping problem, not a cosmetic one.
     */
    const { data: alreadyReal } = await db
      .from("documents")
      .select("id, invoice_number")
      .eq("booking_id", bookingId)
      .eq("type", realType)
      .eq("status", "issued")
      .limit(1);
    if (alreadyReal && alreadyReal.length > 0) {
      await db
        .from("documents")
        .update({
          status: "void",
          meta: { ...(pf.meta ?? {}), superseded_by: alreadyReal[0].id,
                  superseded_reason: `paid → ${realType} ${alreadyReal[0].invoice_number ?? ""} already issued by hand` },
        })
        .eq("id", pf.id).eq("status", "issued");
      continue; // settle the next open pro-forma, if any
    }

    // CLAIM this pro-forma atomically (void it, conditioned on still-issued). If we
    // didn't win the claim (0 rows), a parallel payment write already promoted it —
    // bail so we never mint a duplicate tax invoice. Only the winner generates.
    const { data: claimed } = await db
      .from("documents")
      .update({ status: "void", meta: { ...(pf.meta ?? {}), superseded_reason: "paid → real invoice issued" } })
      .eq("id", pf.id).eq("status", "issued")
      .select("id");
    if (!claimed || claimed.length === 0) break;

    const real: (DocumentRow & { pdf?: Buffer }) = await generateDocument({ bookingId, type: realType });
    const realId = real.id;

    // Link the (now void) pro-forma to its real invoice + re-point allocations.
    await db.from("documents").update({ meta: { ...(pf.meta ?? {}), superseded_by: realId, superseded_reason: "paid → real invoice issued" } }).eq("id", pf.id);
    await db.from("exp_payments").update({ document_id: realId }).eq("booking_id", bookingId).eq("document_id", pf.id);

    // Email the real invoice (best-effort; deduped so retries never double-send).
    {
      try {
        const { data: bk } = await db
          .from("exp_bookings")
          // experience_id and edition_id come along for the next-steps block:
          // without them the mail would promise a crew chat with no date.
          .select("experience_id, edition_id, contacts(name,email), exp_experiences(title)")
          .eq("id", bookingId)
          .maybeSingle();
        const email = bk?.contacts?.email;
        if (email) {
          const currency = real.currency || "EUR";
          const amountStr = real.amount != null
            ? new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(real.amount))
            : "";
          await sendEmail({
            to: email,
            templateKey: "invoice_after_payment",
            bookingId,
            division: real.division || "experience",
            dedupeKey: `invoice_after_payment:${realId}`,
            attachments: real.pdf ? [{ filename: `${real.invoice_number || "invoice"}.pdf`, content: real.pdf }] : undefined,
            vars: {
              firstName: (bk?.contacts?.name ?? "").split(" ")[0] || "there",
              experienceTitle: bk?.exp_experiences?.title ?? "",
              amount: amountStr,
              reference: real.invoice_number || "",
              bookingLink: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/bookings/${bookingId}`,
              /* On the bank-transfer path this mail IS the "you're in" moment,
                 and it fires on the down-payment, not only on the balance. So
                 the next steps belong here: the crew chat, where the week's
                 outline already lives, and how to reach us. */
              ...(await nextStepsVars({
                experienceId: bk?.experience_id ?? null,
                editionId: bk?.edition_id ?? null,
                origin: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.np-seven.com",
              })),
            },
          });
          await db.from("documents").update({ sent_at: new Date().toISOString() }).eq("id", realId).then(() => {}, () => {});
        }
      } catch { /* email is best-effort — the invoice row + PDF exist regardless */ }
    }

    promotedAny = true;
    lastRealId = realId;

    // After a non-final stage, issue the balance pro-forma so the rider can pay
    // the rest early (add-ons that raised the total land here). If the money
    // already covers it, the next loop iteration promotes it too.
    if (milestone === "final") break;
    const { outstanding } = await bookingBillingTotals(bookingId, agreed);
    if (outstanding <= 0.01) break;
    try {
      await generateDocument({ bookingId, type: "proforma_invoice", milestone: "final" });
    } catch { break; }
  }

  return { promoted: promotedAny, documentId: lastRealId };
}

/**
 * Resync a booking's open pro-forma after its total changes (an add-on was
 * confirmed / removed / re-priced). Updates the open pro-forma's amount in place,
 * or — if nothing's open but a balance is now owed (add-on after everything was
 * paid) — issues a fresh balance pro-forma. Immutable real invoices are never
 * touched; over-payment reductions surface as a balance ≤ 0 (handle via a credit
 * note, not built here). Best-effort; safe to call from any add-on write.
 */
export async function resyncBookingBilling(bookingId: string): Promise<void> {
  const db = getDb();
  const { data: bk } = await db.from("exp_bookings").select("agreed_price").eq("id", bookingId).maybeSingle();
  const agreed = Number(bk?.agreed_price ?? 0);

  const { data: pf } = await db
    .from("documents")
    .select("id, meta")
    .eq("booking_id", bookingId)
    .eq("type", "proforma_invoice")
    .eq("status", "issued")
    .maybeSingle();

  if (pf) {
    // Re-generate the OPEN pro-forma at its stage — generateDocument updates it
    // in place (keeps its PF reference) with the new amount.
    const milestone = pf.meta?.milestone === "deposit" ? "deposit" : pf.meta?.milestone === "final" ? "final" : "downpayment";
    try {
      await generateDocument({ bookingId, type: "proforma_invoice", milestone });
      // A confirmed add-on could tip the rider into having overpaid the stage —
      // if so, the payment they've already made now covers the new balance.
      await promoteProformaIfPaid(bookingId);
    } catch { /* best-effort */ }
    return;
  }

  // Nothing open — if a balance is now owed (add-on after full payment), request it.
  const { outstanding } = await bookingBillingTotals(bookingId, agreed);
  if (outstanding > 0.01) {
    try { await generateDocument({ bookingId, type: "proforma_invoice", milestone: "final" }); }
    catch { /* best-effort */ }
  }
}
