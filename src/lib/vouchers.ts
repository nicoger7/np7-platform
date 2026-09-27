/**
 * Gift vouchers — each is for a specific experience, bought by a signed-in
 * member, paid by bank transfer (team-confirmed). Valid 1 year at the price
 * locked at purchase; 50% refundable if unused after that. Pure helpers shared
 * by the buy flow, member area, redemption and admin.
 */

export type VoucherStatus = "pending" | "active" | "redeemed" | "expired" | "refunded" | "cancelled";

export type Voucher = {
  id: string;
  code: string;
  buyer_contact_id: string | null;
  recipient_contact_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  experience_id: string | null;
  package_id: string | null;
  amount: number | null;
  currency: string | null;
  status: VoucherStatus;
  paid_at: string | null;
  issued_at: string | null;
  redeem_by: string | null;
  redeemed_booking_id: string | null;
  redeemed_at: string | null;
  created_at: string;
};

/** Validity in months from activation. */
export const VOUCHER_VALID_MONTHS = 12;
/** Share refunded if a voucher expires unused. */
export const VOUCHER_UNUSED_REFUND_PCT = 50;

const ALPHABET = "ACDEFHJKLMNPRTUVWXY3479"; // no easily-confused chars (0/O, 1/I, etc.)

/** Readable, hard-to-guess code: NP7-XXXX-XXXX. */
export function generateVoucherCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  return `NP7-${block()}-${block()}`;
}

/** redeem_by date = issued + 12 months (yyyy-mm-dd). */
export function redeemByFrom(issuedISO: string): string {
  const d = new Date(issuedISO);
  d.setMonth(d.getMonth() + VOUCHER_VALID_MONTHS);
  return d.toISOString().slice(0, 10);
}

export const STATUS_LABEL: Record<VoucherStatus, string> = {
  pending: "Awaiting payment",
  active: "Ready to use",
  redeemed: "Redeemed",
  expired: "Expired",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<VoucherStatus, "amber" | "green" | "slate"> = {
  pending: "amber",
  active: "green",
  redeemed: "slate",
  expired: "slate",
  refunded: "slate",
  cancelled: "slate",
};

export function fmtVoucherMoney(amount: number | null | undefined, currency = "EUR"): string {
  if (amount == null) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/**
 * How a voucher is used, in one sentence, for every surface that explains it:
 * the gift page, the account page, the PDF, the print page and the emails.
 * Until 27 Sep 2026 those were six different explanations, two of which
 * described a process that does not exist ("reply to your confirmation email",
 * "we'll apply it to your booking").
 */
export const VOUCHER_HOW_TO_REDEEM =
  "Create a free NP7 account, register for a trip, then enter the code under Payment on your trip page.";

/* ─── What is left on a voucher (Nico, 27 Sep 2026) ──────────────────────────
 *
 * A voucher used to be single-use: whatever the trip did not need was lost. A
 * €10,000 gift used on a €2,390 week threw away €7,610, and the guest was only
 * told afterwards. Now the voucher keeps what it did not spend and the same
 * code works again, until it is used up or runs out of time.
 *
 * gift_vouchers.balance (migration 262) holds what is left. NULL means the
 * voucher was never used, so it is still worth its full `amount`. Every
 * surface that shows what a voucher is worth reads it through voucherValueLeft.
 */

/** A remainder at or under one cent is spent: nobody books anything with it. */
export const VOUCHER_SPENT_AT = 0.01;

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Worth = { amount?: number | string | null; balance?: number | string | null };

/** What the voucher is still worth: its balance once used, else its amount. */
export function voucherValueLeft(v: Worth): number {
  const raw = v.balance != null && v.balance !== "" ? v.balance : v.amount;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? cents(n) : 0;
}

/** True once some of the voucher has gone on a booking and some is still left. */
export function voucherPartlyUsed(v: Worth): boolean {
  if (v.balance == null || v.balance === "") return false;
  const left = voucherValueLeft(v);
  return left > VOUCHER_SPENT_AT && left < (Number(v.amount) || 0) - VOUCHER_SPENT_AT;
}

export type VoucherSplit = {
  /** What goes on the booking as a payment. */
  applied: number;
  /** What stays on the voucher afterwards. */
  left: number;
  /** 'active' while something is left, 'redeemed' once it is used up. */
  status: "active" | "redeemed";
};

/**
 * Split what is left on a voucher against a booking's open balance.
 *
 * `outstanding` is null when the booking has no agreed price yet. Then the
 * whole voucher goes on it, as before: there is no total to cap against, and
 * the team settles the difference when the price is set.
 */
export function splitVoucherCredit(valueLeft: number, outstanding: number | null): VoucherSplit {
  const value = cents(Math.max(0, Number(valueLeft) || 0));
  const open = outstanding == null ? null : cents(Math.max(0, Number(outstanding) || 0));
  const applied = open == null ? value : cents(Math.min(value, open));
  let left = cents(value - applied);
  if (left <= VOUCHER_SPENT_AT) left = 0;
  return { applied, left, status: left > 0 ? "active" : "redeemed" };
}

/**
 * Money on a voucher, to the cent only when it has cents. A voucher is bought
 * in whole euros, but what is left after a €5,864.23 week is not, and rounding
 * it would promise a guest money that is not there.
 */
export function fmtVoucherValue(amount: number | null | undefined, currency = "EUR"): string {
  if (amount == null) return "";
  if (Math.abs(amount - Math.round(amount)) < 0.005) return fmtVoucherMoney(Math.round(amount), currency);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

/**
 * The payment row a voucher use writes on the booking.
 *
 * provenance 'off_bank' with a written reason (migration 235). Without it the
 * row defaulted to 'unverified' and sat in the Payments queue asking the team
 * to find a bank transfer that will never exist: the buyer's money arrived
 * once, when the voucher was paid for, not when it is spent.
 */
export function voucherPaymentRow(o: {
  bookingId: string;
  contactId: string | null;
  experienceId: string | null;
  code: string;
  applied: number;
  valueBefore: number;
  left: number;
  currency: string;
  at: string;
}) {
  const money = (n: number) => fmtVoucherValue(n, o.currency || "EUR");
  const note = o.left > 0
    ? `Gift voucher ${o.code} used · ${money(o.applied)} of ${money(o.valueBefore)} · ${money(o.left)} left on the voucher`
    : o.applied < o.valueBefore
      ? `Gift voucher ${o.code} used · ${money(o.applied)} of ${money(o.valueBefore)}`
      : `Gift voucher ${o.code} used · ${money(o.applied)}`;
  return {
    booking_id: o.bookingId,
    contact_id: o.contactId,
    experience_id: o.experienceId,
    amount: o.applied,
    type: "partial",
    method: "voucher",
    reference: o.code,
    direction: "revenue",
    status: "paid",
    date: o.at.slice(0, 10),
    received_at: o.at,
    provenance: "off_bank",
    off_bank_reason: `Gift voucher ${o.code}`,
    notes: note,
  };
}

/** Months a voucher is valid from activation. Value vouchers over €5,000 that
 *  are not tied to one trip get 24, everything else 12. Whether 12 holds under
 *  German law is a question for the lawyer, not for this file. */
export function voucherValidMonths(amount: number | string | null | undefined, experienceId: string | null | undefined): number {
  return Number(amount) > 5000 && !experienceId ? 24 : VOUCHER_VALID_MONTHS;
}

/** The default use-by date (yyyy-mm-dd) for a voucher activated at `fromISO`. */
export function defaultRedeemBy(amount: number | string | null | undefined, experienceId: string | null | undefined, fromISO: string): string {
  const d = new Date(fromISO);
  d.setMonth(d.getMonth() + voucherValidMonths(amount, experienceId));
  return d.toISOString().slice(0, 10);
}

/**
 * A use-by date the team typed in the admin. Empty means "use the default";
 * anything else must be a real calendar date that has not already passed.
 */
export function parseRedeemBy(raw: unknown, todayISO: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };
  const s = String(raw).trim().slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return { ok: false, error: "The use-by date isn't a valid date." };
  }
  if (s < todayISO.slice(0, 10)) return { ok: false, error: "The use-by date is in the past." };
  return { ok: true, value: s };
}

/**
 * The one contact an email belongs to, or null. Two contacts on the same
 * address means we cannot tell whose account the voucher belongs in, so it
 * stays unlinked rather than landing in a stranger's account.
 */
export function soleContactId(rows: { id: string; email: string | null }[] | null | undefined, email: string | null | undefined): string | null {
  const want = String(email ?? "").trim().toLowerCase();
  if (!want) return null;
  const hits = (rows ?? []).filter((r) => String(r.email ?? "").trim().toLowerCase() === want);
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Find that one contact in the database. Case-insensitive, because contacts
 * are not all stored lower-cased. `ilike` treats `_` as a wildcard, so it can
 * over-match; soleContactId then keeps exact matches only, which is why no
 * escaping is needed here. Takes the client as an argument so this file stays
 * free of server imports.
 */
export async function lookupSoleContactId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  email: string | null | undefined,
): Promise<string | null> {
  const want = String(email ?? "").trim().toLowerCase();
  if (!want) return null;
  const { data, error } = await db.from("contacts").select("id, email").ilike("email", want).limit(10);
  if (error) return null;
  return soleContactId(data as { id: string; email: string | null }[], want);
}
