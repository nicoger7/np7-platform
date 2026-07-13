import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/portal/spotguide/proposed — rider-proposed areas still awaiting
 * verification, for the members-only strip at the bottom of the spotguide
 * index. Anonymous → 401 (the strip simply doesn't render).
 */
export async function GET() {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Members only." }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: dests } = await db
    .from("destinations")
    .select("id, name, slug, region, country, submitted_by")
    .eq("spotguide_status", "draft")
    .not("submitted_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(12);
  const rows = (dests ?? []) as { id: string; name: string; slug: string | null; region: string | null; country: string | null; submitted_by: string }[];
  if (!rows.length) return NextResponse.json({ proposed: [] });

  const ids = rows.map((d) => d.id);
  const [{ data: verifs }, { data: spots }] = await Promise.all([
    db.from("destination_verifications").select("destination_id, contact_id, kind").in("destination_id", ids),
    db.from("spots").select("destination_id").in("destination_id", ids).eq("status", "published"),
  ]);
  const confirms = new Map<string, Set<string>>();
  for (const v of (verifs ?? []) as { destination_id: string; contact_id: string; kind: string }[]) {
    if (v.kind !== "confirm") continue;
    (confirms.get(v.destination_id) ?? confirms.set(v.destination_id, new Set()).get(v.destination_id)!).add(v.contact_id);
  }
  const spotCount = new Map<string, number>();
  for (const s of (spots ?? []) as { destination_id: string }[]) spotCount.set(s.destination_id, (spotCount.get(s.destination_id) ?? 0) + 1);

  return NextResponse.json({
    proposed: rows.map((d) => ({
      id: d.id, name: d.name, slug: d.slug, region: d.region, country: d.country,
      confirms: confirms.get(d.id)?.size ?? 0,
      spots: spotCount.get(d.id) ?? 0,
      mine: d.submitted_by === user.contactId,
    })),
  });
}
