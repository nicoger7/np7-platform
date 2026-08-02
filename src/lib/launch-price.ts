/**
 * Launch price — a time-boxed opening discount, set on the EDITION.
 *
 * One percentage and one end date on the week, applied to every package in it
 * ("lets make it easy"): no per-package rows to keep in sync, and switching it
 * off is clearing two fields. The server recomputes it at reservation time, so
 * the price a guest is charged never depends on what the page happened to say.
 */

export type LaunchPricing = { pct: number; until: string } | null;

export function activeLaunch(
  ed: { launch_discount_pct?: number | null; launch_price_until?: string | null } | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): LaunchPricing {
  const pct = Number(ed?.launch_discount_pct ?? 0);
  const until = ed?.launch_price_until ? String(ed.launch_price_until).slice(0, 10) : null;
  if (!pct || pct <= 0 || pct >= 100 || !until || until < today) return null;
  return { pct, until };
}

/** The discounted price, rounded to whole euros — "-10%" must never produce €2,691.30. */
export function launchPrice(price: number, launch: LaunchPricing): number {
  if (!launch) return price;
  return Math.round(price * (1 - launch.pct / 100));
}
