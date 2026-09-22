/**
 * Pre-orders: a window is a PERIOD, never a single date.
 *
 * Dealers order first (their orders size the production run), riders fill what
 * is left. Both pay a deposit with the order and the balance later. A pre-order
 * never reserves stock: the boards do not exist yet, which is the whole point.
 */

export type PreorderAudience = "dealer" | "rider";
export type BalanceDue = "on_dispatch" | "on_arrival" | "before_shipping";
export type WindowStatus = "draft" | "open" | "closed";

export interface PreorderWindow {
  id: string;
  season: number;
  audience: PreorderAudience;
  label: string | null;
  opens_on: string;
  closes_on: string;
  discount_pct: number;
  deposit_kind: "pct" | "amount";
  deposit_value: number;
  balance_due: BalanceDue;
  ships_from: string | null;
  note: string | null;
  status: WindowStatus;
  archived_at?: string | null;
}

export const AUDIENCE_LABEL: Record<PreorderAudience, string> = {
  dealer: "Dealers",
  rider: "Riders",
};

export const BALANCE_DUE_LABEL: Record<BalanceDue, string> = {
  on_arrival: "when the boards arrive",
  before_shipping: "before the boards leave the factory",
  on_dispatch: "when the board ships",
};

/** Draft, still to come, taking orders, or over. `status` wins over the dates. */
export type WindowState = "draft" | "upcoming" | "open" | "closed";

export function windowState(w: PreorderWindow, today = new Date()): WindowState {
  if (w.status === "draft") return "draft";
  if (w.status === "closed") return "closed";
  const day = today.toISOString().slice(0, 10);
  if (day < w.opens_on) return "upcoming";
  if (day > w.closes_on) return "closed";
  return "open";
}

/** Whole days left, or until it opens. Negative once it is over. */
export function daysLeft(w: PreorderWindow, today = new Date()): number {
  const end = new Date(`${w.closes_on}T23:59:59Z`).getTime();
  return Math.ceil((end - today.getTime()) / 86_400_000);
}

export function isTakingOrders(w: PreorderWindow, today = new Date()): boolean {
  return windowState(w, today) === "open";
}

/** What a rider or dealer pays for a board inside the window, in cents. */
export function preorderPriceCents(w: PreorderWindow, listPriceCents: number): number {
  return Math.round(listPriceCents * (1 - (w.discount_pct || 0)));
}

/** What falls due with the order: a share for dealers, a flat amount for riders. */
export function depositCents(w: PreorderWindow, orderTotalCents: number): number {
  if (w.deposit_kind === "pct") return Math.round(orderTotalCents * (w.deposit_value || 0));
  return Math.min(Math.round((w.deposit_value || 0) * 100), orderTotalCents);
}

export function balanceCents(w: PreorderWindow, orderTotalCents: number): number {
  return Math.max(0, orderTotalCents - depositCents(w, orderTotalCents));
}

/** How the deposit reads to a human: "30% with the order" / "500 € with the order". */
export function depositLabel(w: PreorderWindow): string {
  return w.deposit_kind === "pct"
    ? `${Math.round((w.deposit_value || 0) * 100)}% with the order`
    : `${Math.round(w.deposit_value || 0)} € with the order`;
}

/** The one-line rule, for the shop and for a dealer letter. */
export function termsLine(w: PreorderWindow): string {
  const discount = w.discount_pct ? `, ${Math.round(w.discount_pct * 100)}% off` : "";
  return `${depositLabel(w)}, the rest ${BALANCE_DUE_LABEL[w.balance_due]}${discount}.`;
}

/** Dealers always come first: their window has to close before the factory order goes in. */
export function sortWindows(a: PreorderWindow, b: PreorderWindow): number {
  if (a.season !== b.season) return b.season - a.season;
  if (a.audience !== b.audience) return a.audience === "dealer" ? -1 : 1;
  return a.opens_on.localeCompare(b.opens_on);
}
