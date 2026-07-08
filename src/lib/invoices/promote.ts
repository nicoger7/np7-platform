/**
 * Pro-forma → real invoice promotion.
 *
 * The funnel issues a PRO-FORMA (payment request, PF- reference, no tax number
 * burned) at registration. When the rider's money actually arrives, this turns
 * it into the real thing in one move:
 *   1. the official tax invoice is generated (gapless number),
 *   2. payments allocated to the pro-forma are re-pointed at the real invoice,
 *   3. the pro-forma is voided (meta.superseded_by), and
 *   4. the customer gets the real invoice by email (deduped).
 *
 * No payment ever → the pro-forma just expires with the booking and NO Storno
 * is ever needed. Call after any payment write for a booking; idempotent and
 * best-effort (callers should not block the payment write on this).
 */

import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { paymentInflow } from "@/lib/reconcile";
import { generateDocument } from "./generate";
import type { DocumentRow } from "./types";

function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
}

export async function promoteProformaIfPaid(bookingId: string): Promise<{ promoted: boolean; documentId?: string }> {
  const db = getDb();

  // A live pro-forma for this booking?
  const { data: pf } = await db
    .from("documents")
    .select("id, amount, meta, invoice_number")
    .eq("booking_id", bookingId)
    .eq("type", "proforma_invoice")
    .eq("status", "issued")
    .maybeSingle();
  if (!pf || !pf.amount) return { promoted: false };

  // Has enough money actually arrived? (All inflows count — the securing
  // payment is by definition the first money in; refunds subtract.)
  const { data: pays } = await db
    .from("exp_payments")
    .select("id, amount, type, direction, status, document_id")
    .eq("booking_id", bookingId);
  const inflow = ((pays ?? []) as { amount: number | null; type: string | null; direction: string | null; status: string | null }[])
    .reduce((s, p) => s + paymentInflow(p), 0);
  if (inflow + 0.01 < Number(pf.amount)) return { promoted: false };

  const milestone = pf.meta?.milestone === "deposit" ? "deposit" : "downpayment";
  const realType = milestone === "deposit" ? ("deposit_invoice" as const) : ("downpayment_invoice" as const);

  // Idempotency: if the real invoice already exists (double-recorded payment,
  // parallel calls), just make sure the pro-forma is retired.
  const { data: existingReal } = await db
    .from("documents")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("type", realType)
    .eq("status", "issued")
    .maybeSingle();

  let real: (DocumentRow & { pdf?: Buffer }) | null = null;
  let realId: string;
  if (existingReal) {
    realId = existingReal.id;
  } else {
    real = await generateDocument({ bookingId, type: realType });
    realId = real.id;
  }

  // Re-point allocations, retire the pro-forma.
  await db.from("exp_payments").update({ document_id: realId }).eq("booking_id", bookingId).eq("document_id", pf.id);
  await db.from("documents").update({
    status: "void",
    meta: { ...(pf.meta ?? {}), superseded_by: realId, superseded_reason: "paid → real invoice issued" },
  }).eq("id", pf.id);

  // Email the real invoice (best-effort; deduped so retries never double-send).
  if (real) {
    try {
      const { data: bk } = await db
        .from("exp_bookings")
        .select("contacts(name,email), exp_experiences(title)")
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
          },
        });
        await db.from("documents").update({ sent_at: new Date().toISOString() }).eq("id", realId).then(() => {}, () => {});
      }
    } catch { /* email is best-effort — the invoice row + PDF exist regardless */ }
  }

  return { promoted: true, documentId: realId };
}
