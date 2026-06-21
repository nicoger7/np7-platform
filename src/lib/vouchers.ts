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
