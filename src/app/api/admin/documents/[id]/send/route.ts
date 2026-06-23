import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/admin/documents/[id]/send ───────────────────────────────────────
// Email an invoice (PDF attached) to the booking's customer and stamp documents.sent_at.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: doc } = await db
    .from("documents")
    .select("id, booking_id, contact_id, file_path, invoice_number, amount, currency, type, division")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (doc.type === "booking_confirmation") {
    return NextResponse.json({ error: "Only invoices can be sent from here." }, { status: 400 });
  }

  // Recipient + experience: prefer the document's contact, else the booking's.
  let contact: { name?: string | null; email?: string | null } | null = null;
  let experienceTitle = "";
  if (doc.booking_id) {
    const { data: bk } = await db
      .from("exp_bookings")
      .select("id, contacts(name,email), exp_experiences(title)")
      .eq("id", doc.booking_id)
      .maybeSingle();
    contact = bk?.contacts ?? null;
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
  const amountStr = doc.amount != null
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(doc.amount))
    : "";

  const res = await sendEmail({
    to: contact.email,
    templateKey: "invoice_sent",
    bookingId: doc.booking_id || undefined,
    division: doc.division || "experience",
    attachments,
    vars: {
      firstName: (contact.name ?? "").split(" ")[0] || "there",
      experienceTitle,
      amount: amountStr,
      reference: doc.invoice_number || "",
      bookingLink: doc.booking_id ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/bookings/${doc.booking_id}` : "",
    },
  });

  // Stamp sent_at (tolerant: pre-migration-054 the column may be missing).
  await db.from("documents").update({ sent_at: new Date().toISOString() }).eq("id", id).then(
    () => {},
    () => {},
  );

  return NextResponse.json({ ok: true, status: res.status });
}
