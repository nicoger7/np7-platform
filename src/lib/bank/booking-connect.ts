/**
 * The feed, seen from one booking.
 *
 * On the booking's Payments tab the question is not "whose money is this
 * transfer?" but the mirror of it: "has this guest's money arrived?" So the
 * same matcher runs with the candidate list narrowed to THIS booking's open
 * invoices, over every unmatched credit in the feed, and whatever it names is
 * offered with its reasons, one click from booked. A search over all the
 * unmatched credits sits beside it for the transfer that quotes nothing and
 * came from an account we have never seen.
 *
 * Read-only. Connecting goes through store.matchToInvoice, the same door the
 * feed uses, so nothing about how money is booked changes with the page it
 * was booked from.
 */
import { createClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/reconcile";
import { loadCandidates } from "./store";
import { suggestForTransaction, type BankMatch, type MatchCandidate } from "./match";
import type { BankTransactionRow } from "./types";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type CreditView = {
  id: string;
  source: string;
  external_id: string;
  booked_on: string;
  amount: number;
  /** What is still unplaced on it, after any partial allocation. */
  held: number;
  currency: string;
  counterparty: string | null;
  reference: string | null;
  label: string | null;
};

export type BookingSuggestion = {
  transaction: CreditView;
  documentId: string;
  invoiceNumber: string | null;
  remaining: number;
  score: number;
  reasons: string[];
  confidence: BankMatch["confidence"];
};

export type BookingConnectView = {
  /** The booking's invoices still owed money, as the matcher sees them. */
  invoices: { documentId: string; invoiceNumber: string | null; remaining: number; invoiced: number; currency: string | null }[];
  /** Credits the matcher ties to one of those invoices, best first. */
  suggestions: BookingSuggestion[];
  /** Every unmatched credit, for the search box. Newest first. */
  credits: CreditView[];
};

export async function bookingConnectView(bookingId: string, division = "experience"): Promise<BookingConnectView> {
  const admin = db();
  const [all, { data: txs }] = await Promise.all([
    loadCandidates(division),
    admin
      .from("bank_transactions")
      .select("id, source, external_id, booked_on, amount, currency, counterparty, counterparty_iban, reference, label, kind")
      .eq("division", division)
      .is("payment_id", null)
      .is("matched_at", null)
      .is("ignored_at", null)
      .gt("amount", 0)
      .in("kind", ["income", "unknown"])
      .order("booked_on", { ascending: false })
      .limit(400),
  ]);
  const mine: MatchCandidate[] = all.filter((c) => c.bookingId === bookingId);
  const rows = (txs ?? []) as Pick<BankTransactionRow, "id" | "source" | "external_id" | "booked_on" | "amount" | "currency" | "counterparty" | "counterparty_iban" | "reference" | "label" | "kind">[];

  // A partly placed movement holds less than its face value.
  const taken = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 100) {
    const ids = rows.slice(i, i + 100).map((t) => t.id);
    const { data: pays } = await admin.from("exp_payments").select("bank_transaction_id, amount").in("bank_transaction_id", ids);
    for (const p of pays ?? []) {
      const k = String(p.bank_transaction_id);
      taken.set(k, round2((taken.get(k) ?? 0) + (Number(p.amount) || 0)));
    }
  }

  const credits: CreditView[] = rows
    .map((t) => ({
      id: t.id, source: t.source, external_id: t.external_id, booked_on: t.booked_on,
      amount: round2(Number(t.amount)), held: round2(Number(t.amount) - (taken.get(t.id) ?? 0)),
      currency: t.currency, counterparty: t.counterparty, reference: t.reference, label: t.label,
    }))
    .filter((c) => c.held > 0.01);
  const creditById = new Map(credits.map((c) => [c.id, c]));

  const suggestions: BookingSuggestion[] = [];
  if (mine.length) {
    for (const t of rows) {
      const view = creditById.get(t.id);
      if (!view) continue;
      const matches = suggestForTransaction(
        {
          amount: view.held,
          currency: t.currency,
          reference: [t.reference, t.label].filter(Boolean).join(" · ") || null,
          counterparty: t.counterparty,
          counterpartyIban: t.counterparty_iban,
          bookedOn: t.booked_on,
        },
        mine,
      );
      for (const m of matches) {
        suggestions.push({
          transaction: view,
          documentId: m.candidate.documentId,
          invoiceNumber: m.candidate.invoiceNumber,
          remaining: m.candidate.remaining,
          score: m.score,
          reasons: m.reasons,
          confidence: m.confidence,
        });
      }
    }
  }
  suggestions.sort((a, b) => b.score - a.score);

  return {
    invoices: mine.map((c) => ({ documentId: c.documentId, invoiceNumber: c.invoiceNumber, remaining: c.remaining, invoiced: c.invoiced, currency: c.currency })),
    suggestions: suggestions.slice(0, 8),
    credits,
  };
}
