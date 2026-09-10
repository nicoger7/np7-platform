import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, CRON_DENIED } from "@/lib/cron-auth";
import { qontoTransactions, qontoConfigured } from "@/lib/bank/qonto";
import { stripeCharges, stripeConfigured } from "@/lib/bank/stripe-feed";
import { importTransactions } from "@/lib/bank/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fetches the bank and the card payments on a schedule.
 *
 * "Sync now" was a person pressing a button, which meant the answer to "who has
 * paid" was only as current as the last time somebody remembered to ask. That
 * is the same shape of problem as the campaign scheduler: a job dressed up as a
 * habit. Nico: "synch may be automatic."
 *
 * IMPORTS ONLY, exactly like the button. Nothing is booked, no payment row is
 * written, no invoice is touched. Connecting money to an invoice stays a
 * deliberate human click, because the cost of a wrong one is a guest chased for
 * money they already sent.
 *
 * Safe to run as often as it likes: the unique index on
 * (source, external_id) makes a repeat import a no-op, so an overlapping run
 * cannot duplicate a movement. That is worth stating because it is exactly what
 * went wrong by hand on 2026-09-10, when 292 rows were renamed to match code
 * that had not shipped and the next sync imported all of them again.
 *
 * The window is deliberately wider than the interval. A transfer can settle
 * days after it is sent, and Qonto only shows it once it has; a job that asked
 * only for "since yesterday" would miss anything that took longer than a day to
 * land. Re-reading a month costs nothing because of the dedupe above.
 */
const WINDOW_DAYS = 30;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json(CRON_DENIED, { status: 401 });

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const report: Record<string, unknown> = { since };
  const errors: string[] = [];

  if (qontoConfigured()) {
    const { ok, transactions, error } = await qontoTransactions(since);
    if (!ok && error) errors.push(`qonto: ${error}`);
    const imp = transactions.length ? await importTransactions(transactions, "experience") : { inserted: 0, updated: 0, errors: [] };
    errors.push(...imp.errors.map((e) => `qonto: ${e}`));
    report.qonto = { fetched: transactions.length, inserted: imp.inserted, updated: imp.updated };
  } else {
    report.qonto = "not configured";
  }

  if (stripeConfigured()) {
    const { ok, transactions, error } = await stripeCharges(since);
    if (!ok && error) errors.push(`stripe: ${error}`);
    const imp = transactions.length ? await importTransactions(transactions, "experience") : { inserted: 0, updated: 0, errors: [] };
    errors.push(...imp.errors.map((e) => `stripe: ${e}`));
    report.stripe = { fetched: transactions.length, inserted: imp.inserted, updated: imp.updated };
  } else {
    report.stripe = "not configured";
  }

  if (errors.length) report.errors = errors;
  // A source being down is worth a non-200 so it shows up in Vercel's cron log
  // as a failure rather than a green tick with a sad payload.
  return NextResponse.json(report, { status: errors.length ? 502 : 200 });
}
