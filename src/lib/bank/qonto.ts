/**
 * Qonto — NP7 Experience's bank (Olinda SAS, German branch; BIC QNTODEB2XXX,
 * IBAN DE05 1001 0123 6088 9797 08).
 *
 * Deliberately a thin fetch wrapper, like src/lib/stripe.ts: no SDK, and every
 * call degrades to "not configured" when the keys are missing so the page and
 * the build work long before anyone pastes a secret.
 *
 * Auth is the API-key form: `Authorization: <login>:<secret>`, both from
 * Qonto → Settings → Integrations → API. The login is the organisation slug.
 */
import type { BankKind, NormalisedTransaction } from "./types";

const QONTO = "https://thirdparty.qonto.com/v2";

export function qontoConfigured(): boolean {
  return !!(process.env.QONTO_API_LOGIN && process.env.QONTO_API_SECRET);
}

function authHeader(): string | null {
  const login = process.env.QONTO_API_LOGIN;
  const secret = process.env.QONTO_API_SECRET;
  return login && secret ? `${login}:${secret}` : null;
}

async function qontoGet(path: string, params: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const auth = authHeader();
  if (!auth) return { ok: false, status: 0, json: { error: "QONTO_API_LOGIN / QONTO_API_SECRET not set" } };
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${QONTO}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export type QontoAccount = { id: string; iban: string | null; currency: string | null; balance: number | null; name: string | null };

/** The organisation's bank accounts. Used to find the account id to page over. */
export async function qontoAccounts(): Promise<QontoAccount[]> {
  const { ok, json } = await qontoGet("/organization");
  if (!ok) return [];
  const org = json.organization as { bank_accounts?: Record<string, unknown>[] } | undefined;
  return (org?.bank_accounts ?? []).map((a) => ({
    id: String(a.id ?? ""),
    iban: (a.iban as string) ?? null,
    currency: (a.currency as string) ?? null,
    balance: a.balance != null ? Number(a.balance) : null,
    name: (a.name as string) ?? null,
  }));
}

/**
 * Qonto's own words for what a movement is, mapped onto ours.
 *
 * `side` already says in or out, so kind only has to catch the rows that are
 * NOT customer money even though they look like it — above all the Stripe
 * payout, which is the one entry that would double the card revenue if it were
 * treated as income.
 */
function classify(t: Record<string, unknown>, side: string): BankKind {
  const op = String(t.operation_type ?? "").toLowerCase();
  const hay = `${t.label ?? ""} ${t.reference ?? ""} ${t.note ?? ""}`.toLowerCase();

  if (op === "qonto_fee" || /qonto\s*(fee|abo)|kontoführung/.test(hay)) return "fee";
  // A PSP settling its balance. The individual charges are imported from the
  // PSP itself, so this row must never enter the matching pile.
  if (/\bstripe\b|\bpaypal\b|\bmollie\b|\badyen\b|\bsumup\b/.test(hay)) {
    return side === "credit" ? "payout" : "fee";
  }
  if (op === "internal_transfer") return "transfer";
  return side === "credit" ? "income" : "expense";
}

function normalise(t: Record<string, unknown>, accountIban: string | null): NormalisedTransaction | null {
  const externalId = String(t.transaction_id ?? t.id ?? "");
  if (!externalId) return null;

  const side = String(t.side ?? "").toLowerCase(); // credit | debit
  // Qonto reports a positive magnitude plus a side. We store one signed number
  // so any selection sums to its own net movement without a CASE.
  const magnitude = t.amount != null ? Number(t.amount) : Number(t.amount_cents ?? 0) / 100;
  const amount = side === "debit" ? -Math.abs(magnitude) : Math.abs(magnitude);

  const settled = (t.settled_at as string) ?? null;
  const emitted = (t.emitted_at as string) ?? null;
  // settled_at is when the money really moved; emitted_at is when it was sent.
  // A pending row has no settled_at, so fall back rather than drop the row.
  const when = settled ?? emitted ?? new Date().toISOString();

  const rawStatus = String(t.status ?? "completed").toLowerCase();
  const status = rawStatus === "pending" || rawStatus === "declined" ? (rawStatus as "pending" | "declined") : "completed";

  return {
    source: "qonto",
    externalId,
    accountRef: accountIban,
    bookedOn: when.slice(0, 10),
    executedAt: when,
    amount: Math.round(amount * 100) / 100,
    currency: String(t.currency ?? "EUR"),
    // Qonto puts the other party in different places depending on the rail.
    counterparty:
      (t.counterparty_name as string) ??
      (t.initiator_id ? null : (t.label as string)) ??
      null,
    counterpartyIban: (t.counterparty_iban as string) ?? null,
    // The customer's transfer text — where the invoice number should be, and
    // therefore the single most valuable field in this whole file.
    reference: [t.reference, t.note].filter(Boolean).map(String).join(" · ") || null,
    label: (t.label as string) ?? null,
    status,
    kind: classify(t, side),
    raw: t,
  };
}

/**
 * Every transaction settled on or after `since`, newest first, paged out.
 * `since` is a date string; Qonto wants an ISO timestamp.
 */
export async function qontoTransactions(since: string, maxPages = 20): Promise<{ ok: boolean; transactions: NormalisedTransaction[]; error?: string }> {
  if (!qontoConfigured()) return { ok: false, transactions: [], error: "Qonto is not configured" };

  const accounts = await qontoAccounts();
  if (!accounts.length) return { ok: false, transactions: [], error: "Qonto returned no bank accounts — check the API login and secret." };

  const out: NormalisedTransaction[] = [];
  for (const account of accounts) {
    for (let page = 1; page <= maxPages; page++) {
      const { ok, status, json } = await qontoGet("/transactions", {
        bank_account_id: account.id,
        "status[]": "completed",
        settled_at_from: new Date(since).toISOString(),
        page: String(page),
        per_page: "100",
      });
      if (!ok) {
        return { ok: false, transactions: out, error: `Qonto /transactions returned ${status}` };
      }
      const rows = (json.transactions as Record<string, unknown>[]) ?? [];
      for (const r of rows) {
        const n = normalise(r, account.iban);
        if (n) out.push(n);
      }
      const meta = json.meta as { next_page?: number | null } | undefined;
      if (rows.length < 100 || !meta?.next_page) break;
    }
  }
  return { ok: true, transactions: out };
}
