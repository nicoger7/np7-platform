/**
 * Qonto — NP7's bank (Olinda SAS German branch, BIC QNTODEB2XXX,
 * IBAN DE05 1001 0123 6088 9797 08).
 *
 * The platform reads the account directly. It went the other way first, through
 * the NP7 Windsurfing admin's bridge, on the argument that one sync means one
 * version of the truth. Nico overruled it for a concrete reason: that admin
 * pulls Qonto once a day on a cron, so anything downstream of it is up to
 * twenty-four hours stale, and this page exists to answer "who has paid".
 * Freshness beats tidiness here.
 *
 * What that costs, stated plainly so nobody rediscovers it the hard way: two
 * systems now read the same account into two databases. They can disagree, and
 * when they do, the NP7 Windsurfing admin is the one that feeds lexoffice and
 * therefore the official books. This ledger is for working out who paid, not
 * for being the source of the accounts.
 *
 * Thin fetch wrapper, no SDK, same shape as src/lib/stripe.ts: every call
 * degrades to "not configured" when the keys are missing.
 *
 * ⚠ The field mapping below is NOT from Qonto's public docs, which are thin and
 * in places wrong. It is taken from the client that has been running against
 * this account in the NP7 Windsurfing repo (src/lib/bank-sync.ts). Three things
 * that cost me a first draft: pagination is `current_page`, NOT `page`; amounts
 * are `amount_cents` plus a `side`, never a float; and the counterparty's name
 * is in `label`. If this file ever stops working, compare it with that one
 * before believing any documentation.
 */
import type { BankKind, NormalisedTransaction } from "./types";

const QONTO = "https://thirdparty.qonto.com/v2";

export function qontoConfigured(): boolean {
  return !!(process.env.QONTO_API_LOGIN && process.env.QONTO_API_SECRET);
}

async function qontoGet(
  path: string,
  params: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; error?: string }> {
  const login = process.env.QONTO_API_LOGIN;
  const secret = process.env.QONTO_API_SECRET;
  if (!login || !secret) return { ok: false, status: 0, json: {}, error: "QONTO_API_LOGIN / QONTO_API_SECRET are not set." };

  const url = new URL(QONTO + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    // The API-key form. Not "Bearer" — Qonto wants the pair, bare.
    res = await fetch(url, { headers: { Authorization: `${login}:${secret}`, Accept: "application/json" }, cache: "no-store" });
  } catch (e) {
    return { ok: false, status: 0, json: {}, error: `Could not reach Qonto: ${e instanceof Error ? e.message : e}` };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false, status: res.status, json: {},
      error: res.status === 401
        ? "Qonto rejected the credentials. Keys expire after about 30 days unused — make a new pair in Qonto → Settings → Integrations → API."
        : `Qonto ${path} returned ${res.status}: ${body.slice(0, 160)}`,
    };
  }
  return { ok: true, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export type QontoAccount = { id: string; slug: string | null; iban: string | null; name: string | null; currency: string; balanceCents: number | null };

/** The organisation's accounts. Also the cheapest way to test the credentials. */
export async function qontoAccounts(): Promise<{ ok: boolean; accounts: QontoAccount[]; error?: string }> {
  const { ok, json, error } = await qontoGet("/organization");
  if (!ok) return { ok: false, accounts: [], error };
  const org = json.organization as { bank_accounts?: Record<string, unknown>[] } | undefined;
  const accounts = (org?.bank_accounts ?? []).map((a) => ({
    id: String(a.id ?? ""),
    slug: (a.slug as string) ?? null,
    iban: (a.iban as string) ?? null,
    name: (a.name as string) ?? null,
    currency: String(a.currency ?? "EUR").toUpperCase(),
    balanceCents: a.balance_cents != null ? Math.round(Number(a.balance_cents)) : null,
  }));
  return { ok: true, accounts };
}

export type QontoTx = {
  transaction_id?: string;
  amount_cents?: number;
  side?: "credit" | "debit";
  currency?: string;
  label?: string | null;
  reference?: string | null;
  note?: string | null;
  operation_type?: string | null;
  settled_at?: string | null;
  emitted_at?: string | null;
  status?: string;
  counterparty_iban?: string | null;
};

/**
 * What sort of movement this is.
 *
 * The classification that actually matters is the Stripe payout. Card charges
 * are imported per guest from Stripe itself, and the same money arrives again
 * here days later as one net credit. Counting it as income would add the whole
 * card volume to revenue twice and drop a lump nobody can match at the top of
 * the to-do pile.
 */
export function classifyQonto(t: QontoTx): BankKind {
  const op = String(t.operation_type ?? "").toLowerCase();
  const hay = `${t.label ?? ""} ${t.reference ?? ""} ${t.note ?? ""}`.toLowerCase();
  const credit = t.side !== "debit";

  if (op === "qonto_fee" || /qonto\s*(fee|abo|geb(ü|ue)hr)|kontoführung/.test(hay)) return "fee";
  if (/\bstripe\b|\bpaypal\b|\bmollie\b|\badyen\b|\bsumup\b|\bklarna\b/.test(hay)) return credit ? "payout" : "fee";
  if (op === "internal_transfer" || /umbuchung|eigen(ü|ue)bertrag/.test(hay)) return "transfer";
  return credit ? "income" : "expense";
}

export function normaliseQonto(t: QontoTx, accountIban: string | null): NormalisedTransaction | null {
  const externalId = String(t.transaction_id ?? "");
  // settled_at is when the money really moved; emitted_at is when it was sent.
  const when = t.settled_at ?? t.emitted_at ?? null;
  if (!externalId || !when) return null;

  const sign = t.side === "debit" ? -1 : 1;
  const cents = Math.abs(Math.round(Number(t.amount_cents ?? 0)));
  const raw = String(t.status ?? "completed").toLowerCase();

  return {
    source: "qonto",
    externalId,
    accountRef: accountIban,
    bookedOn: when.slice(0, 10),
    executedAt: when,
    // One signed number, in euros, so any selection sums to its own net
    // movement without a CASE.
    amount: (sign * cents) / 100,
    currency: String(t.currency ?? "EUR").toUpperCase(),
    // Qonto puts the other party's name in `label`, not in a counterparty field.
    counterparty: t.label ?? null,
    counterpartyIban: t.counterparty_iban ?? null,
    // The Verwendungszweck: where the guest types the invoice number, and the
    // reason the matcher works at all.
    reference: t.reference ?? t.note ?? null,
    label: t.operation_type ?? null,
    status: raw === "pending" || raw === "declined" ? (raw as "pending" | "declined") : "completed",
    kind: classifyQonto(t),
    raw: t as unknown as Record<string, unknown>,
  };
}

/** Every settled transaction on or after `since`, across all accounts. */
export async function qontoTransactions(
  since: string,
  maxPages = 40
): Promise<{ ok: boolean; transactions: NormalisedTransaction[]; error?: string }> {
  const { ok, accounts, error } = await qontoAccounts();
  if (!ok) return { ok: false, transactions: [], error };
  if (!accounts.length) return { ok: false, transactions: [], error: "Qonto returned no bank accounts for this organisation." };

  const cutoff = since.slice(0, 10);
  const out: NormalisedTransaction[] = [];

  for (const account of accounts) {
    // Newest first, stopping once a whole page predates the cutoff. Qonto's
    // date-filter parameters are unreliable enough that the client which has
    // actually been running against this account does not use them either.
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const { ok: pageOk, json, error: pageErr } = await qontoGet("/transactions", {
        bank_account_id: account.id,
        "status[]": "completed",
        per_page: "100",
        current_page: String(pageNo),
      });
      if (!pageOk) return { ok: false, transactions: out, error: pageErr };

      const rows = (json.transactions as QontoTx[]) ?? [];
      if (!rows.length) break;

      const kept = rows
        .map((r) => normaliseQonto(r, account.iban))
        .filter((n): n is NormalisedTransaction => n !== null && n.bookedOn >= cutoff);
      out.push(...kept);

      const meta = json.meta as { next_page?: number | null } | undefined;
      // A page entirely older than the cutoff means we are past it.
      if (!kept.length || !meta?.next_page) break;
    }
  }
  return { ok: true, transactions: out };
}
