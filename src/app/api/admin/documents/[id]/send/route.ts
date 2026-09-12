import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { requireAdminGate } from "@/lib/admin-auth";
// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/admin/documents/[id]/send ───────────────────────────────────────
// Email an invoice (PDF attached) to the booking's customer and stamp documents.sent_at.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  /* An explicit recipient, for checking a document before it reaches the
     customer. Nothing else changes — the same mail, the same attachment — so
     what lands in your inbox is what theirs would have got. */
  const body = await request.json().catch(() => ({}));
  const overrideTo = typeof body?.to === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to.trim())
    ? body.to.trim()
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: doc } = await db
    .from("documents")
    .select("id, booking_id, contact_id, bill_to_contact_id, file_path, invoice_number, amount, currency, type, division, status, meta")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (doc.type === "booking_confirmation") {
    return NextResponse.json({ error: "Only invoices can be sent from here." }, { status: 400 });
  }
  // A cancelled number is written off; mailing it would hand the customer a
  // document that does not count.
  if (doc.status === "void") {
    return NextResponse.json({ error: `${doc.invoice_number ?? "This document"} is cancelled and cannot be sent.` }, { status: 400 });
  }

  // Recipient + experience.
  //
  // The billing contact wins where there is one: a trip bought as a present, or
  // by a company, is invoiced to the buyer, and sending their invoice to the
  // traveller would both misfile it and — for a surprise — give the game away.
  // Uwe Baerenz has no email address at all until his birthday, precisely so
  // nothing can reach him; without this the send would simply fail.
  let contact: { name?: string | null; email?: string | null } | null = null;
  let experienceTitle = "";
  if (doc.bill_to_contact_id) {
    const { data: c } = await db.from("contacts").select("name,email").eq("id", doc.bill_to_contact_id).maybeSingle();
    contact = c ?? null;
  }
  if (doc.booking_id) {
    const { data: bk } = await db
      .from("exp_bookings")
      .select("id, contacts(name,email), exp_experiences(title)")
      .eq("id", doc.booking_id)
      .maybeSingle();
    contact = contact ?? bk?.contacts ?? null;
    experienceTitle = bk?.exp_experiences?.title ?? "";
  }
  if (!contact?.email && doc.contact_id) {
    const { data: c } = await db.from("contacts").select("name,email").eq("id", doc.contact_id).maybeSingle();
    contact = c ?? contact;
  }
  if (!contact?.email) {
    return NextResponse.json({ error: "No email on file for this customer." }, { status: 400 });
  }

  // Attach the stored PDF (best-effort).
  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (doc.file_path) {
    const { data: blob } = await db.storage.from("documents").download(doc.file_path);
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      attachments = [{ filename: `${doc.invoice_number || "invoice"}.pdf`, content: buf }];
    }
  }

  const currency = doc.currency || "EUR";
  const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  const amountStr = doc.amount != null ? money(Math.abs(Number(doc.amount))) : "";
  const firstName = (contact.name ?? "").split(" ")[0] || "there";
  const bookingLink = doc.booking_id ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/bookings/${doc.booking_id}` : "";

  /*
   * A correction is not an invoice and must not be mailed as one. The invoice
   * template asks the guest to "pay by bank transfer and quote the
   * reference", which under a Storno is exactly wrong: nothing is payable,
   * and money may be coming BACK. It gets its own words, and the amount is
   * the credit, never the stored negative.
   */
  const isCorrection = doc.type === "credit_note";
  const cm = (doc.meta ?? {}) as { full?: boolean; original_invoice_number?: string; reason?: string; refund_due?: number };
  const res = await sendEmail({
    to: overrideTo ?? contact.email,
    templateKey: isCorrection ? "credit_note_sent" : "invoice_sent",
    bookingId: doc.booking_id || undefined,
    division: doc.division || "experience",
    attachments,
    // A person pressed Send. The soft-launch hold guards automated mail, not this.
    manual: true,
    vars: isCorrection
      ? {
          firstName,
          experienceTitle,
          amount: amountStr,
          reference: doc.invoice_number || "",
          originalReference: cm.original_invoice_number || "",
          kind: cm.full === true ? "storno" : "credit",
          reason: cm.reason || "",
          refundAmount: Number(cm.refund_due) > 0 ? money(Number(cm.refund_due)) : "",
          bookingLink,
        }
      : {
          firstName,
          experienceTitle,
          amount: doc.amount != null
            ? new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(doc.amount))
            : "",
          reference: doc.invoice_number || "",
          bookingLink,
        },
  });

  // A copy sent somewhere else is not the document reaching its recipient, so
  // it must not stamp sent_at — otherwise the real send is skipped as done.
  if (overrideTo) {
    return NextResponse.json({ ok: true, sentTo: overrideTo, preview: true, id: res });
  }

  // Stamp sent_at (tolerant: pre-migration-054 the column may be missing).
  await db.from("documents").update({ sent_at: new Date().toISOString() }).eq("id", id).then(
    () => {},
    () => {},
  );

  return NextResponse.json({ ok: true, status: res.status });
}
