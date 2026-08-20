import { getMemberTier } from "@/lib/member-tier";
import { activeLaunch, launchPrice } from "@/lib/launch-price";

/**
 * Tier perks (migration 169): percentage advantages for Rider/Crew/Legend.
 *
 * Resolution is MOST SPECIFIC WINS — a package row beats an edition row beats
 * an experience-wide row, so "Legend −8% on Full Experience, −0% on Own Gear"
 * is two package rows overriding one experience rule.
 *
 * Stacking policy (Nico, 2026-08-21): percentages NEVER stack. A booking gets
 * the single best advantage — launch price OR tier discount, whichever is
 * larger. Vouchers are payments, not discounts, and live elsewhere.
 */
export type TierPerkRule = {
  tier: string;
  kind: string;
  value: number;
  edition_id: string | null;
  package_id: string | null;
};

export function resolveTierPct(
  rules: TierPerkRule[],
  opts: { tier: string; editionId: string | null; packageId: string | null },
): number {
  const mine = rules.filter((r) => r.tier === opts.tier && r.kind === "discount_pct");
  const pick = (xs: TierPerkRule[]) => (xs.length ? Math.max(...xs.map((r) => Number(r.value) || 0)) : null);
  const byPackage = opts.packageId ? pick(mine.filter((r) => r.package_id === opts.packageId)) : null;
  if (byPackage != null) return byPackage;
  const byEdition = opts.editionId ? pick(mine.filter((r) => !r.package_id && r.edition_id === opts.editionId)) : null;
  if (byEdition != null) return byEdition;
  return pick(mine.filter((r) => !r.package_id && !r.edition_id)) ?? 0;
}

/** What the booking-price and the picker both show: the one best advantage. */
export type PriceAdvantage = { pct: number; label: string; until?: string | null } | null;

export function bestAdvantage(
  launch: { pct: number; until: string } | null,
  tierPct: number,
  tierLabel: string | null,
): PriceAdvantage {
  const l = launch?.pct ?? 0;
  if (tierPct <= 0 && l <= 0) return null;
  return tierPct > l
    ? { pct: tierPct, label: `${tierLabel ?? "Member"} price` }
    : { pct: l, label: "Launch price", until: launch!.until };
}

/**
 * The one price a booking may be created at — recomputed SERVER-SIDE at
 * booking time (the page's number is display, not authority). Both /reserve
 * and /register call this, so the member view and the invoice always agree.
 */
export async function bookingPrice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  opts: {
    price: number;
    experienceId: string;
    editionId: string | null;
    packageId: string;
    edition: { launch_discount_pct?: number | null; launch_price_until?: string | null } | null;
    contactId: string | null;
  },
): Promise<{ price: number; noteSuffix: string }> {
  const launch = activeLaunch(opts.edition);
  let tierPct = 0, tierLabel: string | null = null;
  if (opts.contactId && opts.experienceId) {
    const tier = await getMemberTier(opts.contactId).catch(() => null);
    if (tier) {
      const { data } = await db
        .from("exp_tier_perks")
        .select("tier,kind,value,edition_id,package_id")
        .eq("experience_id", opts.experienceId)
        .eq("active", true);
      tierPct = resolveTierPct((Array.isArray(data) ? data : []) as TierPerkRule[], {
        tier: tier.key, editionId: opts.editionId, packageId: opts.packageId,
      });
      tierLabel = tier.label;
    }
  }
  const adv = bestAdvantage(launch, tierPct, tierLabel);
  if (!adv) return { price: opts.price, noteSuffix: "" };
  const price = adv.label === "Launch price"
    ? launchPrice(opts.price, launch)
    : Math.round(opts.price * (1 - adv.pct / 100));
  return { price, noteSuffix: ` · ${adv.label.toLowerCase()} −${adv.pct}%` };
}
