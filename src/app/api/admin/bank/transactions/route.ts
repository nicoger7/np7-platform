/**
 * GET /api/admin/bank/transactions — the ledger, with a suggestion attached to
 * every unmatched credit.
 *
 * Suggestions are computed on read rather than stored, on purpose: the ranking
 * depends on what is still owed, and that changes every time anyone books a
 * payment. A stored suggestion would be stale the moment it mattered.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";
import { loadCandidates, withSuggestions } from "@/lib/bank/store";
import { adminBridgeConfigured } from "@/lib/bank/admin-bridge";
import { stripeConfigured } from "@/lib/bank/stripe-feed";
import type { BankTransactionRow } from "@/lib/bank/types";

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const division = searchParams.get("division") || "experience";
  const view = searchParams.get("view") || "unmatched"; // unmatched | matched | ignored | all
  const kind = searchParams.get("kind");
  const search = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let q = admin
    .from("bank_transactions")
    .select("*")
    .eq("division", division)
    .order("booked_on", { ascending: false })
    .limit(limit);

  if (view === "unmatched") q = q.is("payment_id", null).is("ignored_at", null);
  else if (view === "matched") q = q.not("payment_id", "is", null);
  else if (view === "ignored") q = q.not("ignored_at", "is", null);

  if (kind) q = q.eq("kind", kind);
  if (search) {
    const like = `%${search}%`;
    q = q.or(`counterparty.ilike.${like},reference.ilike.${like},label.ilike.${like},external_id.ilike.${like}`);
  }

  const { data, error } = await q;
  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ error: "Migration 233 not applied: bank_transactions is missing." }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as BankTransactionRow[];
  // Only the unmatched credits need candidates; skip the work otherwise.
  // Candidates are needed for the suggestions AND for the manual picker, so
  // load them whenever anything on this page could be matched by hand.
  const candidates = await loadCandidates(division);

  // Totals over the WHOLE division, not the page, so the header does not
  // change meaning when a filter is applied.
  const { data: allRows } = await admin
    .from("bank_transactions")
    .select("amount, kind, payment_id, ignored_at")
    .eq("division", division);

  const money = (allRows ?? []) as { amount: number; kind: string; payment_id: string | null; ignored_at: string | null }[];
  const inflow = money.filter((m) => m.kind === "income" && Number(m.amount) > 0);
  const totals = {
    transactions: money.length,
    // Payouts and internal transfers are deliberately outside every total —
    // the charges inside a payout are already counted one by one.
    received: inflow.reduce((s, m) => s + Number(m.amount), 0),
    spent: money.filter((m) => m.kind === "expense").reduce((s, m) => s + Number(m.amount), 0),
    unmatched: inflow.filter((m) => !m.payment_id && !m.ignored_at).length,
    unmatchedValue: inflow.filter((m) => !m.payment_id && !m.ignored_at).reduce((s, m) => s + Number(m.amount), 0),
    matched: inflow.filter((m) => m.payment_id).length,
  };

  return NextResponse.json({
    transactions: withSuggestions(rows, candidates),
    totals,
    sources: { bank: adminBridgeConfigured(), stripe: stripeConfigured() },
    // The manual picker searches this list — every invoice still owed money.
    candidates: candidates.map((c) => ({
      documentId: c.documentId,
      invoiceNumber: c.invoiceNumber,
      guestName: c.guestName,
      experienceTitle: c.experienceTitle,
      editionLabel: c.editionLabel,
      remaining: c.remaining,
      invoiced: c.invoiced,
      currency: c.currency,
      dueDate: c.dueDate,
      bookingId: c.bookingId,
    })),
  });
}
