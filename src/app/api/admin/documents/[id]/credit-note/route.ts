import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { generateCreditNote } from "@/lib/invoices/generate";
import { correctionsByOriginal, correctionAllowance, correctionState, typeLabel, type DocLike } from "@/lib/invoices/corrections";
import { isReceived, type PaymentLike } from "@/lib/payment-totals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The correction door for ONE invoice: `[id]` is the invoice being corrected.
 *
 * It lives under /api/admin/documents on purpose. Invoices are money, and the
 * documents prefix is owner-only and owned by the Finance section in
 * src/lib/access.ts, so this path inherits both gates. The previous door,
 * /api/admin/bookings/:id/credit-note, sat under the Bookings section, which
 * every operational role can edit: anyone who could move a booking could
 * reverse a tax invoice. Closed with this route.
 */

const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

// ─── GET: what a correction of this invoice would do ─────────────────────────

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: orig } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (!orig) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data: siblings } = orig.booking_id
    ? await db.from("documents").select("id,type,status,amount,invoice_number,meta,issued_at,created_at,sent_at,paid_at").eq("booking_id", orig.booking_id)
    : { data: [orig] };
  const byOriginal = correctionsByOriginal((siblings ?? []) as DocLike[]);
  const allowance = correctionAllowance(orig as DocLike, byOriginal);
  const state = correctionState(orig as DocLike, byOriginal);

  // Same refund rule the generator applies, so the dialog says the number the
  // document will print.
  const originalAmount = round2(Number(orig.amount) || 0);
  let paidAgainst = 0;
  if (orig.booking_id) {
    const { data: pays } = await db.from("exp_payments").select("amount,type,direction,status,document_id").eq("booking_id", orig.booking_id);
    const allocated = round2(((pays ?? []) as (PaymentLike & { document_id?: string | null })[])
      .filter((p) => p.document_id === orig.id && isReceived(p))
      .reduce((s, p) => s + (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0), 0));
    paidAgainst = allocated > 0 ? Math.min(allocated, originalAmount) : orig.paid_at ? originalAmount : 0;
  }

  return NextResponse.json({
    original: {
      id: orig.id,
      booking_id: orig.booking_id,
      invoice_number: orig.invoice_number,
      type: orig.type,
      typeLabel: typeLabel(orig as DocLike),
      amount: originalAmount,
      currency: orig.currency || "EUR",
      issued_at: orig.issued_at,
      sent_at: orig.sent_at ?? null,
      paid_at: orig.paid_at ?? null,
    },
    canStorno: allowance.canStorno,
    canCredit: allowance.canCredit,
    blocker: allowance.blocker,
    credited: allowance.credited,
    remaining: allowance.remaining,
    reversed: state.reversed,
    corrections: state.credits.map((c) => ({ id: c.id, invoice_number: c.invoice_number, amount: c.amount, full: (c.meta as { full?: boolean } | null)?.full === true })),
    paidAgainst,
    /** What a full Storno would owe back; a partial credit owes min(credit, this). */
    refundableNow: round2(Math.max(0, paidAgainst - allowance.credited)),
  });
}

// ─── POST: issue it ──────────────────────────────────────────────────────────
// Body: { mode: "storno" | "credit"; amount?: number; reason: string }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;

  let body: { mode?: string; amount?: number | string; reason?: string; bookingId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const mode = body.mode === "credit" ? "credit" : body.mode === "storno" ? "storno" : null;
  if (!mode) return NextResponse.json({ error: "Say which correction this is: mode must be \"storno\" or \"credit\"." }, { status: 400 });
  const amount = mode === "credit" ? Number(body.amount) : undefined;
  if (mode === "credit" && (!Number.isFinite(amount) || (amount as number) <= 0)) {
    return NextResponse.json({ error: "A credit note needs the amount to credit." }, { status: 400 });
  }

  try {
    const document = await generateCreditNote({
      originalDocumentId: id,
      bookingId: typeof body.bookingId === "string" && body.bookingId ? body.bookingId : undefined,
      amount,
      reason: String(body.reason ?? ""),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let signedUrl: string | null = null;
    if (document.file_path) {
      const { data } = await db.storage.from("documents").createSignedUrl(document.file_path, 3600);
      signedUrl = data?.signedUrl ?? null;
    }
    // The PDF buffer stays on the server; the row and a link are what the UI needs.
    const { pdf: _pdf, ...row } = document;
    void _pdf;
    return NextResponse.json({ document: { ...row, signedUrl } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not issue the correction.";
    const status = /already being issued/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
