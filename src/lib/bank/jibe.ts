/**
 * The bank feed comes from jibe (the NP7 Windsurfing admin), not from Qonto.
 *
 * That system already syncs the Qonto account — it holds the API key, it runs
 * the daily cron, it files the supplier receipts into lexoffice, and it has a
 * CSV importer covering seven German bank formats for anything the API misses.
 * It exposes the finished rows at /api/jibe/bank-transactions specifically for
 * this platform, and says why in its own header: *"Der Qonto-Schluessel bleibt
 * allein im Admin; die Platform holt sich hier die fertig synchronisierten
 * Buchungen mit dem Bridge-Token ab."*
 *
 * So the platform does NOT talk to Qonto. Two systems polling one bank account
 * into two databases would be two versions of the truth, with no way to tell
 * which had missed a day — and the whole point of this ledger is that it is the
 * side that cannot drift. One sync, one source, read across.
 *
 * jibe owns money going OUT (supplier invoices, receipts, lexoffice vouchers).
 * This platform owns money coming IN (which guest paid which invoice). Same
 * transactions, opposite questions, and only the credits matter here.
 *
 * Env: JIBE_BASE_URL + JIBE_BRIDGE_TOKEN.
 */
import type { BankKind, NormalisedTransaction } from "./types";

export function jibeConfigured(): boolean {
  return !!(process.env.JIBE_BASE_URL && process.env.JIBE_BRIDGE_TOKEN);
}

/** One row exactly as the bridge serves it. Deliberately no `raw` and no
 *  balance — jibe keeps the full Qonto payload and the account state. */
export type BridgeRow = {
  booking_date: string;
  value_date: string | null;
  amount_cents: number;
  currency: string;
  counterparty: string | null;
  counterparty_iban: string | null;
  purpose: string | null;
  booking_type: string | null;
  category: string | null;
  match_status: string | null;
  tx_hash: string;
  side: "credit" | "debit";
};

/**
 * What sort of movement this is.
 *
 * The one classification that really matters is the Stripe payout. Card
 * charges are imported per guest from Stripe itself, and the same money lands
 * again in Qonto days later as a single net credit. Treating that credit as
 * income would add the entire card volume to revenue a second time and put a
 * lump nobody can match at the top of the to-do pile.
 */
function classify(row: BridgeRow): BankKind {
  const hay = `${row.counterparty ?? ""} ${row.purpose ?? ""} ${row.booking_type ?? ""} ${row.category ?? ""}`.toLowerCase();
  const credit = row.side === "credit";

  if (/\bqonto\s*(fee|abo|gebühr)|kontoführung/.test(hay)) return "fee";
  if (/\bstripe\b|\bpaypal\b|\bmollie\b|\badyen\b|\bsumup\b|\bklarna\b/.test(hay)) {
    return credit ? "payout" : "fee";
  }
  if (/internal_transfer|umbuchung|eigenübertrag/.test(hay)) return "transfer";
  return credit ? "income" : "expense";
}

export function normaliseBridgeRow(row: BridgeRow): NormalisedTransaction | null {
  if (!row.tx_hash || !row.booking_date) return null;
  return {
    // jibe's hash carries its origin: "qonto:<transaction_id>" for API rows,
    // a content hash for anything imported from a CSV there.
    source: row.tx_hash.startsWith("qonto:") ? "qonto" : "csv",
    // The hash IS the identity, on both sides. Our unique index on
    // (source, external_id) therefore inherits jibe's idempotency for free:
    // re-reading the bridge can never produce a second copy of a movement.
    externalId: row.tx_hash,
    // jibe does not say which of its accounts a row came from, and NP7
    // Experience has one. Left null rather than invented.
    accountRef: null,
    bookedOn: row.booking_date,
    executedAt: row.value_date ?? row.booking_date,
    // Already signed on the wire, and in cents, so there is nothing to infer.
    amount: Math.round(Number(row.amount_cents)) / 100,
    currency: (row.currency || "EUR").toUpperCase(),
    counterparty: row.counterparty,
    counterpartyIban: row.counterparty_iban,
    // jibe's `purpose` is the Verwendungszweck — the field the guest types the
    // invoice number into, and the reason any of this works.
    reference: row.purpose,
    label: row.booking_type,
    status: "completed",
    kind: classify(row),
    raw: row as unknown as Record<string, unknown>,
  };
}

/** Every transaction jibe knows about since `since`, paged out. */
export async function jibeTransactions(
  since: string,
  maxPages = 40
): Promise<{ ok: boolean; transactions: NormalisedTransaction[]; error?: string }> {
  if (!jibeConfigured()) {
    return { ok: false, transactions: [], error: "JIBE_BASE_URL / JIBE_BRIDGE_TOKEN are not set." };
  }
  const base = String(process.env.JIBE_BASE_URL).replace(/\/+$/, "");
  const out: NormalisedTransaction[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = `${base}/api/jibe/bank-transactions?since=${encodeURIComponent(since)}&limit=500&offset=${offset}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.JIBE_BRIDGE_TOKEN}` },
        cache: "no-store",
      });
    } catch (e) {
      return { ok: false, transactions: out, error: `Could not reach jibe at ${base}: ${e instanceof Error ? e.message : e}` };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        transactions: out,
        error: res.status === 401
          ? "jibe rejected the bridge token — JIBE_BRIDGE_TOKEN must match the one set in the NP7 Windsurfing admin."
          : `jibe returned ${res.status}: ${body.slice(0, 160)}`,
      };
    }
    const json = (await res.json().catch(() => ({}))) as {
      transactions?: BridgeRow[];
      next_offset?: number | null;
      has_more?: boolean;
    };
    for (const r of json.transactions ?? []) {
      const n = normaliseBridgeRow(r);
      if (n) out.push(n);
    }
    if (!json.has_more || json.next_offset == null) break;
    offset = json.next_offset;
  }
  return { ok: true, transactions: out };
}
