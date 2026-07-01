import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { EDIT_FIELD_LABEL, humanEditValue, type EditableField } from "@/lib/spotguide-trust";

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

  // Member-suggested edits awaiting NP7 review (or community confirmation).
  const { data: rawEdits } = await db
    .from("spot_edits")
    .select("id, spot_id, contact_id, field, old_value, new_value, note, created_at")
    .eq("status", "pending").order("created_at", { ascending: false });
  let edits: Record<string, unknown>[] = [];
  if (rawEdits && rawEdits.length) {
    const eSpotIds = [...new Set(rawEdits.map((e: { spot_id: string }) => e.spot_id))];
    const eContactIds = [...new Set(rawEdits.map((e: { contact_id: string }) => e.contact_id))];
    const [{ data: eSpots }, { data: eContacts }] = await Promise.all([
      db.from("spots").select("id, name").in("id", eSpotIds),
      db.from("contacts").select("id, name").in("id", eContactIds),
    ]);
    const spotName = new Map((eSpots ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    const who = new Map((eContacts ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    edits = rawEdits.map((e: Record<string, unknown>) => ({
      id: e.id, spotId: e.spot_id, spotName: spotName.get(e.spot_id as string) ?? "—",
      proposer: who.get(e.contact_id as string) ?? "A member",
      field: e.field, fieldLabel: EDIT_FIELD_LABEL[e.field as EditableField] ?? e.field,
      from: humanEditValue(e.field as string, e.old_value), to: humanEditValue(e.field as string, e.new_value),
      note: e.note ?? null, created_at: e.created_at,
    }));
  }

  return NextResponse.json({ spots: out, photos: photos ?? [], proposedDests: proposedDests ?? [], edits });
}
