/**
 * The shape every source is flattened into before it touches the database.
 *
 * Qonto, Stripe and a CSV disagree about almost everything — field names,
 * date formats, whether an amount carries its own sign, what "settled" means.
 * They agree on exactly one thing, which is that a movement happened. That is
 * what this type is: the agreement, with the source's own payload kept beside
 * it so a rule invented next month can be re-run over old rows without asking
 * anyone's API again.
 */
export type BankSource = "qonto" | "stripe" | "csv" | "manual";

/**
 * income   — a customer paid us. This is the pile that wants matching.
 * expense  — we paid someone. Belongs to costs.
 * payout   — a PSP settling its balance into the bank. NEVER revenue: the
 *            charges inside it are already here one by one, so counting the
 *            payout too would double the whole Stripe volume.
 * fee      — the PSP's cut or a bank charge.
 * transfer — between our own accounts; nets to zero across the group.
 */
export type BankKind = "income" | "expense" | "payout" | "fee" | "transfer" | "unknown";

export type NormalisedTransaction = {
  source: BankSource;
  /** The id the SOURCE gives it. Together with source this is the dedupe key. */
  externalId: string;
  accountRef?: string | null;
  /** Date the money moved, YYYY-MM-DD. Drives every total. */
  bookedOn: string;
  executedAt?: string | null;
  /** Signed: positive is money in. */
  amount: number;
  currency: string;
  counterparty?: string | null;
  counterpartyIban?: string | null;
  /** Verwendungszweck / description — where the invoice number should be. */
  reference?: string | null;
  label?: string | null;
  status: "pending" | "completed" | "declined";
  kind: BankKind;
  raw: Record<string, unknown>;
};

/** A row as it comes back out of the database. */
export type BankTransactionRow = {
  id: string;
  division: string;
  source: BankSource;
  external_id: string;
  account_ref: string | null;
  booked_on: string;
  executed_at: string | null;
  amount: number;
  currency: string;
  counterparty: string | null;
  counterparty_iban: string | null;
  reference: string | null;
  label: string | null;
  status: string;
  kind: BankKind;
  raw: Record<string, unknown>;
  payment_id: string | null;
  document_id: string | null;
  matched_at: string | null;
  matched_by: string | null;
  match_confidence: "auto" | "suggested" | "manual" | null;
  ignored_at: string | null;
  ignored_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncResult = {
  source: BankSource;
  /** Rows the source returned. */
  fetched: number;
  /** Rows that were new to us. The rest were already here — re-syncing is safe. */
  inserted: number;
  updated: number;
  /** Auto-matched to an invoice without anyone deciding. */
  autoMatched: number;
  /** Tied back to a payment that was already in the books by hand. */
  reconciledExisting: number;
  errors: string[];
  configured: boolean;
};
