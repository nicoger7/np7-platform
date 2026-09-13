/**
 * How money that is NOT in the feed arrived. Pure, so the booking page and
 * the Payments page can import it without dragging the server stack along.
 *
 * Four answers, on purpose. "Bank transfer" is not one of them: a transfer to
 * NP7's account IS in the feed and is connected there, never typed. The
 * reason field beside these is mandatory (migration 235) and is printed next
 * to the amount wherever the row shows.
 */
export const OFF_BANK_METHODS = [
  { key: "cash", label: "Cash", blurb: "Paid in hand, at the centre or in person." },
  { key: "surfcenter", label: "Wired to Surfcenter", blurb: "Landed on the old Surfcenter Experience account, not NP7's." },
  { key: "offset", label: "Offset", blurb: "Netted against something we owed them, or a credit they held." },
  { key: "other", label: "Other", blurb: "Anything else the feed will never show. Say what in the reason." },
] as const;

export type OffBankMethod = (typeof OFF_BANK_METHODS)[number]["key"];

export const isOffBankMethod = (v: unknown): v is OffBankMethod => OFF_BANK_METHODS.some((m) => m.key === v);

export const offBankMethodLabel = (key: string | null | undefined): string =>
  OFF_BANK_METHODS.find((m) => m.key === key)?.label ?? (key || "Other");

/** The four words that say what a row is. */
export const PROVENANCE_LABEL: Record<string, string> = {
  bank: "Bank",
  off_bank: "Off-bank",
  unverified: "Unverified",
  legacy: "Legacy",
};
