/**
 * POST /api/admin/bank/sync — fetch the bank and card movements.
 *
 * IMPORT ONLY. Nothing is booked, no payment row is written, no invoice is
 * touched: this call makes the ledger show what the bank did, and every match
 * stays a human click on the page.
 *
 * Safe to run as often as anyone likes — the unique index on
 * (source, external_id) makes a repeat a no-op.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { qontoTransactions, qontoConfigured } from "@/lib/bank/qonto";
import { stripeCharges, stripeConfigured } from "@/lib/bank/stripe-feed";
import { importTransactions } from "@/lib/bank/store";
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

  if (!only || only === "bank") {
    // Straight from Qonto. Deduped on its own transaction_id, so a repeat sync
    // is a no-op however often anyone presses the button.
    const r: SyncResult = { source: "qonto", fetched: 0, inserted: 0, updated: 0, errors: [], configured: qontoConfigured() };
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
    const r: SyncResult = { source: "stripe", fetched: 0, inserted: 0, updated: 0, errors: [], configured: stripeConfigured() };
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

  /*
   * Syncing IMPORTS, and does nothing else.
   *
   * It used to auto-book the certain matches in the same call. Nico's
   * instruction on 2026-09-09 is explicit — "dont book any payments" — and he
   * is right that it should not have been the default anyway: a sync is
   * someone asking to see the bank, not asking to change the books. The
   * suggestions are computed on read and shown on the page; connecting one is
   * a deliberate click, and stays that way.
   */
  return NextResponse.json({ results });
}
