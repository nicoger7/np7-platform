/**
 * POST /api/admin/bank/sync — pull from Qonto and Stripe, then match what is
 * certain.
 *
 * Safe to run as often as anyone likes: the unique index on
 * (source, external_id) makes a repeat import a no-op, and auto-matching only
 * books what the matcher is certain about.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { qontoTransactions, qontoConfigured } from "@/lib/bank/qonto";
import { stripeCharges, stripeConfigured } from "@/lib/bank/stripe-feed";
import { importTransactions, reconcileWithExistingPayments, autoMatchPending } from "@/lib/bank/store";
import type { SyncResult } from "@/lib/bank/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  // Default window is deliberately wide. The first sync should bring the whole
  // history in — that is what makes the €31,911 unmatched pile answerable.
  const since = typeof body.since === "string" ? body.since : "2026-01-01";
  const only = typeof body.source === "string" ? body.source : null;
  const division = typeof body.division === "string" ? body.division : "experience";

  const results: SyncResult[] = [];

  if (!only || only === "qonto") {
    const r: SyncResult = { source: "qonto", fetched: 0, inserted: 0, updated: 0, autoMatched: 0, reconciledExisting: 0, errors: [], configured: qontoConfigured() };
    if (r.configured) {
      const { ok, transactions, error } = await qontoTransactions(since);
      r.fetched = transactions.length;
      if (!ok && error) r.errors.push(error);
      if (transactions.length) {
        const imp = await importTransactions(transactions, division);
        r.inserted = imp.inserted; r.updated = imp.updated; r.errors.push(...imp.errors);
      }
    } else {
      r.errors.push("QONTO_API_LOGIN / QONTO_API_SECRET are not set.");
    }
    results.push(r);
  }

  if (!only || only === "stripe") {
    const r: SyncResult = { source: "stripe", fetched: 0, inserted: 0, updated: 0, autoMatched: 0, reconciledExisting: 0, errors: [], configured: stripeConfigured() };
    if (r.configured) {
      const { ok, transactions, error } = await stripeCharges(since);
      r.fetched = transactions.length;
      if (!ok && error) r.errors.push(error);
      if (transactions.length) {
        const imp = await importTransactions(transactions, division);
        r.inserted = imp.inserted; r.updated = imp.updated; r.errors.push(...imp.errors);
      }
    } else {
      r.errors.push("STRIPE_SECRET_KEY is not set in this environment.");
    }
    results.push(r);
  }

  // Tie new rows to payments that were already entered by hand BEFORE matching
  // fresh ones, so the import never writes a second copy of money we booked.
  const { linked } = await reconcileWithExistingPayments();
  const { matched, considered } = await autoMatchPending();

  return NextResponse.json({
    results,
    reconciledExisting: linked,
    autoMatched: matched,
    consideredForMatching: considered,
  });
}
