import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { getMemberTier } from "@/lib/member-tier";
import { getExperienceCards } from "@/lib/experience-cards";

/**
 * The signed-in member's price advantage per trip.
 *
 * /experience is statically generated — it has no viewer, so its cards can only
 * ever show the PUBLIC launch discount. A Legend browsing the grid saw
 * "Launch price · 5% off" while the picker one click later charged 10%, which
 * reads as the discount disappearing rather than stacking.
 *
 * The tiles fetch this after mount and swap the chip in. It deliberately reuses
 * getExperienceCards — the exact code the picker prices from — so the number on
 * the tile can never drift from the number at checkout.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const empty = NextResponse.json({ advantages: {} });
  const member = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!member?.contactId) return empty;

  const tier = await getMemberTier(member.contactId).catch(() => null);
  // Rider gets no tier perk, so the public card is already correct.
  if (!tier || tier.key === "rider") return empty;

  const { cards } = await getExperienceCards({ tierKey: tier.key, tierLabel: tier.label });
  const advantages: Record<string, { pct: number; label: string; until?: string | null }> = {};
  for (const c of cards) if (c.advantage) advantages[c.slug] = c.advantage;
  return NextResponse.json({ advantages });
}
