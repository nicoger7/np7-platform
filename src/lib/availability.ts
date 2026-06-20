import { createAdminClient } from "@/lib/supabase";

/**
 * Spot availability for the redesigned funnel: only a paid downpayment takes a
 * spot. Registrations / leads / payment_pending do NOT fill a trip — so "spots
 * left" must count SECURED bookings, not registrations.
 *
 * Uses the service-role client (the public pages read via the anon client, which
 * can't see team-only bookings) — only the per-edition count is ever returned.
 */
const SECURED = new Set(["downpayment_paid", "paid", "confirmed", "attended"]);

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
    const secured = b.downpayment_received || b.final_payment_received || SECURED.has((b.status || "").toLowerCase());
    if (secured && b.edition_id) out[b.edition_id] = (out[b.edition_id] || 0) + 1;
  }
  return out;
}

/** Spots left from a cap and the secured count (null when there's no cap). */
export function spotsLeftFrom(maxSpots: number | null | undefined, securedCount: number): number | null {
  return maxSpots != null ? Math.max(0, maxSpots - securedCount) : null;
}
