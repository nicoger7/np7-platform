/**
 * /api/admin/bookings/[id]/payments/bank — the feed, from this booking's side.
 *
 *   GET   unmatched credits the matcher ties to one of THIS booking's open
 *         invoices, with reasons; the booking's open invoices; and every
 *         unmatched credit for the search box
 *   POST  { transactionId, documentId, amount?, fromSuggestion? }
 *         connect one of them. Goes through store.matchToInvoice, the same
 *         door the feed uses; the invoice has to belong to this booking
 *
 * Money the feed can see is connected here, never typed. Typing is the
 * back-door on ../route.ts, and it needs a reason.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminGate, getRequestAccess, getRequestMember } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { bookingConnectView } from "@/lib/bank/booking-connect";
import { matchToInvoice } from "@/lib/bank/store";

type Ctx = { params: Promise<{ id: string }> };

/** The feed is money; a role that may not see money on a booking may not see
 *  other guests' transfers through it either. */
async function moneyDenied(): Promise<NextResponse | null> {
  const access = await getRequestAccess();
  if (access && !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "Your role cannot see payments." }, { status: 403 });
  }
  return null;
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const denied = (await requireAdminGate()) ?? (await moneyDenied());
  if (denied) return denied;
  const { id } = await params;
  const view = await bookingConnectView(id);
  return NextResponse.json(view);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const denied = (await requireAdminGate()) ?? (await moneyDenied());
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const transactionId = String(body.transactionId ?? "");
  const documentId = String(body.documentId ?? "");
  if (!transactionId || !documentId) {
    return NextResponse.json({ error: "transactionId and documentId are required." }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: doc } = await admin.from("documents").select("id, booking_id, status").eq("id", documentId).maybeSingle();
  if (!doc || String(doc.booking_id) !== id) {
    return NextResponse.json({ error: "That invoice does not belong to this booking." }, { status: 400 });
  }
  if (doc.status !== "issued") return NextResponse.json({ error: "That invoice is not open." }, { status: 400 });

  const member = await getRequestMember();
  const amount = body.amount == null || body.amount === "" ? undefined : Number(body.amount);
  if (amount !== undefined && !(Number.isFinite(amount) && amount > 0)) {
    return NextResponse.json({ error: "The amount to connect must be a positive number." }, { status: 400 });
  }
  const res = await matchToInvoice({
    transactionId,
    documentId,
    amount,
    by: member?.id ?? "admin",
    confidence: body.fromSuggestion ? "suggested" : "manual",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, paymentId: res.paymentId });
}
