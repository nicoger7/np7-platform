import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/portal/spotguide/mine?dest=<destinationId> — the logged-in member's
 * OWN ratings + forecast votes for a destination and its spots, so the public
 * page can pre-fill "your rating". Anonymous → { loggedIn:false }.
 */
export async function GET(request: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ loggedIn: false });

  const destId = (request.nextUrl.searchParams.get("dest") ?? "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  let spotIds: string[] = [];
  if (destId) {
    const { data: spots } = await db.from("spots").select("id").eq("destination_id", destId);
    spotIds = (spots ?? []).map((s: { id: string }) => s.id);
  }

  const [{ data: sr }, { data: sv }, { data: dr }] = await Promise.all([
    spotIds.length ? db.from("spot_ratings").select("*").eq("contact_id", user.contactId).in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    spotIds.length ? db.from("spot_forecast_votes").select("spot_id, model").eq("contact_id", user.contactId).in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    destId ? db.from("destination_ratings").select("ratings").eq("contact_id", user.contactId).eq("destination_id", destId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const spots: Record<string, { ratings?: Record<string, number>; model?: string; level?: string | null; levels?: string[]; conditions?: string[]; wind_window?: Record<string, string> }> = {};
  for (const r of sr ?? []) spots[r.spot_id] = { ...(spots[r.spot_id] ?? {}), ratings: r.ratings ?? {}, level: r.level ?? null, levels: (r.levels?.length ? r.levels : r.level ? [r.level] : []), conditions: r.conditions ?? [], wind_window: r.wind_window ?? {} };
  for (const v of sv ?? []) spots[v.spot_id] = { ...(spots[v.spot_id] ?? {}), model: v.model };

  return NextResponse.json({ loggedIn: true, dest: dr?.ratings ?? null, spots });
}
