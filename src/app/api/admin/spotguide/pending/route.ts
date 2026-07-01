import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/spotguide/pending — member-submitted spots awaiting review +
// member photos awaiting moderation, for the Spotguide moderation page.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: spots, error } = await db
    .from("spots")
    .select("id, name, destination_id, level, conditions, description, verification, created_at")
    .eq("source", "member")
    .neq("verification", "np7")
    .order("created_at", { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Run migration 062 first.", spots: [], photos: [] }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const destIds = [...new Set((spots ?? []).map((s: { destination_id: string }) => s.destination_id))];
  const spotIds = (spots ?? []).map((s: { id: string }) => s.id);
  const [{ data: dests }, { data: verifs }, { data: photos }] = await Promise.all([
    destIds.length ? db.from("destinations").select("id, name, slug").in("id", destIds) : Promise.resolve({ data: [] }),
    spotIds.length ? db.from("spot_verifications").select("spot_id, kind").in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    db.from("spot_photos").select("id, spot_id, url, caption, status").in("status", ["pending", "hidden"]),
  ]);
  const destName = new Map((dests ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));

  const out = (spots ?? []).map((s: Record<string, unknown>) => {
    const vs = (verifs ?? []).filter((v: { spot_id: string }) => v.spot_id === s.id);
    return {
      ...s,
      destinationName: destName.get(s.destination_id as string) ?? "—",
      confirms: vs.filter((v: { kind: string }) => v.kind === "confirm").length,
      flags: vs.filter((v: { kind: string }) => v.kind === "flag").length,
    };
  });
  // Member-proposed new areas (destinations) awaiting NP7 publish.
  const { data: proposedDests } = await db
    .from("destinations")
    .select("id, name, region, slug")
    .not("submitted_by", "is", null)
    .eq("spotguide_status", "draft");

  return NextResponse.json({ spots: out, photos: photos ?? [], proposedDests: proposedDests ?? [] });
}
