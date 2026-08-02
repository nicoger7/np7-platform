import { createAdminClient } from "@/lib/supabase";
import { isAttending, isLostStatus } from "@/lib/types";

/**
 * Spot availability for the lean funnel: only a paid hold-deposit takes a spot.
 * Leads / reserved bookings do NOT fill a trip — so "spots left" counts the
 * confirmed/attending bookings (status confirmed onward, or a deposit on file).
 *
 * Uses the service-role client (the public pages read via the anon client, which
 * can't see team-only bookings) — only the per-edition count is ever returned.
 */
export async function paidSpotsByEdition(editionIds: (string | null | undefined)[]): Promise<Record<string, number>> {
  const ids = [...new Set(editionIds.filter(Boolean))] as string[];
  if (!ids.length) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("exp_bookings")
    .select("edition_id, status, downpayment_received, final_payment_received")
    .in("edition_id", ids);
  const out: Record<string, number> = {};
  for (const b of (data || []) as { edition_id: string | null; status: string | null; downpayment_received: boolean | null; final_payment_received: boolean | null }[]) {
    // A cancelled booking keeps its payment flags (they are history, and the
    // refund lives on them) — so without this check it holds its spot forever
    // and the week looks fuller than it is.
    if (isLostStatus(b.status)) continue;
    const secured = b.downpayment_received || b.final_payment_received || isAttending(b.status);
    if (secured && b.edition_id) out[b.edition_id] = (out[b.edition_id] || 0) + 1;
  }
  return out;
}

/** Spots left from a cap and the secured count (null when there's no cap). */
export function spotsLeftFrom(maxSpots: number | null | undefined, securedCount: number): number | null {
  return maxSpots != null ? Math.max(0, maxSpots - securedCount) : null;
}
