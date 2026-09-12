/**
 * GET /api/admin/bank/transactions — the ledger, with a suggestion attached to
 * every unmatched credit AND to every unplaced debit.
 *
 * Suggestions are computed on read rather than stored, on purpose: the ranking
 * depends on what is still owed (income) or still expected (costs), and that
 * changes every time anyone books a payment. A stored suggestion would be
 * stale the moment it mattered.
 *
 * Money in is matched to invoices (store.ts, unchanged). Money out is
 * allocated to cost lines (bank/costs.ts): the same shape, the other
 * direction, and neither side is ever booked without a click.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";
import { loadCandidates, loadSettledInvoices, withSuggestions } from "@/lib/bank/store";
import { loadCostCandidates, costAllocationsForTransactions, scopeTotals, withCostSuggestions, isCostDebit } from "@/lib/bank/costs";
import { qontoConfigured } from "@/lib/bank/qonto";
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
  // load them whenever anything on this page could be matched by hand. The
  // settled index answers the other case: a transfer quoting an invoice that
  // is already paid.
  const debitIds = rows.filter((t) => Number(t.amount) < 0).map((t) => t.id);
  const anyDebit = rows.some((t) => isCostDebit(t));
  const [candidates, settled, costCandidates, placed, costTotals] = await Promise.all([
    loadCandidates(division),
    loadSettledInvoices(division),
    anyDebit ? loadCostCandidates() : Promise.resolve([]),
    costAllocationsForTransactions(debitIds),
    scopeTotals(division),
  ]);

  // What the "new cost from this debit" form can point at. Kept here so the
  // page needs no grant beyond the bank section to fill its own picker.
  const [{ data: experiences }, { data: editions }] = await Promise.all([
    admin.from("exp_experiences").select("id, title").is("archived_at", null).order("title"),
    admin.from("exp_editions").select("id, label, year, date_start, date_end, experience_id").is("archived_at", null).order("date_start", { ascending: false }),
  ]);

  /*
   * No headline totals.
   *
   * There were four summary cards: received, still to match, connected, money
   * out. Nico killed them on sight and he is right. This is ONE Qonto account
   * carrying every NP7 business, so "Received EUR 188,311.28" answers a
   * question nobody asked, and answers it wrongly on a page that says
   * Experience at the top. The one figure that IS this page's question is how
   * much of the money out has been placed on a cost line, and by scope; that
   * is `costTotals`, and it is about the work, not the balance.
   */
  return NextResponse.json({
    transactions: withCostSuggestions(withSuggestions(rows, candidates, settled), costCandidates, placed),
    count: rows.length,
    sources: { bank: qontoConfigured(), stripe: stripeConfigured() },
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
    // The cost picker searches this one — every line that still expects money.
    costCandidates: costCandidates
      .filter((c) => c.open > 0.01)
      .map((c) => ({
        costId: c.costId, item: c.item, scope: c.scope, scopeLabel: c.scopeLabel,
        editionId: c.editionId, experienceId: c.experienceId, experienceTitle: c.experienceTitle,
        year: c.year, open: c.open, estimated: c.estimated, state: c.state,
        marginClass: c.marginClass, unplanned: c.unplanned,
      })),
    costTotals,
    scopeOptions: { experiences: experiences ?? [], editions: editions ?? [] },
  });
}
