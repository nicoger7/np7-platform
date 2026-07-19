import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { EDIT_FIELD_LABEL, humanEditValue, type EditableField } from "@/lib/spotguide-trust";
import { COMMUNITY_VERIFY_THRESHOLD } from "@/lib/spotguide";

// GET /api/admin/spotguide/pending — member-submitted spots awaiting review +
// member photos awaiting moderation, for the Spotguide moderation page.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // NOTE: we deliberately do NOT filter on `verification` here. A decision has
  // to actually stick — "Approve (community)" used to leave the spot matching
  // `verification != np7`, so it reappeared on every reload. Instead we pull all
  // member/jibe spots and keep only what still needs a human below (undecided,
  // or flagged at any verification level).
  const { data: spots, error } = await db
    .from("spots")
    .select("id, name, destination_id, level, conditions, description, verification, status, created_at")
    .in("source", ["member", "jibe"]) // jibe = AI-intake drafts awaiting review
    .order("created_at", { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Run migration 062 first.", spots: [], photos: [] }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const destIds = [...new Set((spots ?? []).map((s: { destination_id: string }) => s.destination_id))];
  const spotIds = (spots ?? []).map((s: { id: string }) => s.id);
  const [{ data: dests }, { data: verifs }, { data: photos }] = await Promise.all([
    destIds.length ? db.from("destinations").select("id, name, slug").in("id", destIds) : Promise.resolve({ data: [] }),
    spotIds.length ? db.from("spot_verifications").select("spot_id, kind, note").in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    db.from("spot_photos").select("id, spot_id, url, caption, status").in("status", ["pending", "hidden"]),
  ]);
  const destName = new Map((dests ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));

  // Tag each pending spot so the admin surfaces only what needs a human: FLAGGED
  // (riders reported it wrong) or STUCK (no one's confirmed it after a few days —
  // early on, when there's no community yet, this catches everything so nothing
  // rots). The rest just wait for the crowd. Needs-attention sorts to the top.
  const STUCK_DAYS = 3;
  const out = (spots ?? []).map((s: Record<string, unknown>) => {
    const vs = (verifs ?? []).filter((v: { spot_id: string }) => v.spot_id === s.id);
    const confirms = vs.filter((v: { kind: string }) => v.kind === "confirm").length;
    const flags = vs.filter((v: { kind: string }) => v.kind === "flag").length;
    // the "why" behind each flag — the reasons riders typed when flagging
    const flagReasons = vs.filter((v: { kind: string; note?: string | null }) => v.kind === "flag" && v.note && String(v.note).trim())
      .map((v: { note?: string | null }) => String(v.note).trim());
    const ageDays = Math.floor((Date.now() - new Date(String(s.created_at)).getTime()) / 86_400_000);
    const flagged = flags > 0;
    const stuck = !flagged && ageDays >= STUCK_DAYS && confirms < COMMUNITY_VERIFY_THRESHOLD;
    return { ...s, destinationName: destName.get(s.destination_id as string) ?? "—", confirms, flags, flagReasons, ageDays, flagged, stuck };
  }).filter((s: { flagged: boolean; verification: string; status: string }) =>
    // Still needs a human: undecided AND not hidden (Hide is a decision — it
    // sticks), OR carrying open rider flags. Every admin decision clears the
    // open flags (spots PATCH), so only a NEW flag pulls a spot back — including
    // a hidden one, which is exactly when you'd want a second look.
    (s.verification === "pending" && s.status !== "hidden") || s.flagged
  ).sort((a: { flagged: boolean; stuck: boolean; ageDays: number }, b: { flagged: boolean; stuck: boolean; ageDays: number }) =>
    (Number(b.flagged) - Number(a.flagged)) || (Number(b.stuck) - Number(a.stuck)) || (b.ageDays - a.ageDays));
  // Member-proposed new areas (destinations) awaiting NP7 publish.
  const { data: proposedDests } = await db
    .from("destinations")
    .select("id, name, region, slug")
    .not("submitted_by", "is", null)
    .eq("spotguide_status", "draft");

  // Member-suggested edits: pending (name/pin awaiting apply, info awaiting
  // confirms) + approved info notes awaiting a merge into the description.
  const { data: rawEdits } = await db
    .from("spot_edits")
    .select("id, spot_id, contact_id, field, old_value, new_value, note, status, created_at")
    .in("status", ["pending", "approved"]).order("created_at", { ascending: false });
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
      field: e.field, fieldLabel: EDIT_FIELD_LABEL[e.field as EditableField] ?? e.field, status: e.status,
      from: humanEditValue(e.field as string, e.old_value), to: humanEditValue(e.field as string, e.new_value),
      note: e.note ?? null, created_at: e.created_at,
    }));
  }

  // jibe queue readout: Job A = pending member spots still missing structured
  // fields; Job B = community-approved tips awaiting a merge into the description.
  const { data: memberPending } = await db.from("spots")
    .select("level, conditions, infrastructure")
    .eq("source", "member").eq("status", "published").eq("verification", "pending");
  const toStructure = (memberPending ?? []).filter((s: { level: unknown; conditions: unknown; infrastructure: unknown }) =>
    !s.level || !(Array.isArray(s.conditions) && s.conditions.length) || !(Array.isArray(s.infrastructure) && s.infrastructure.length)).length;
  const toMerge = (rawEdits ?? []).filter((e: { field: string; status: string }) => e.field === "info" && e.status === "approved").length;

  // Job C: raw intake texts waiting for jibe to structure into draft spots
  // (tolerant: table ships with migration 107)
  let toIntake = 0;
  try {
    const { count } = await db.from("spot_intake_queue").select("id", { count: "exact", head: true }).eq("status", "pending");
    toIntake = count ?? 0;
  } catch { /* pre-migration */ }

  // last heartbeat — jibe logs one jibe_runs row per run, even a no-op
  // (tolerant: table may not exist pre-migration 095)
  let lastRun: { ran_at: string; structured: number; merged: number; summary: string | null } | null = null;
  try {
    const { data: hb } = await db.from("jibe_runs").select("ran_at, structured, merged, summary")
      .eq("job", "spotguide").order("ran_at", { ascending: false }).limit(1).maybeSingle();
    if (hb) lastRun = hb;
  } catch { /* pre-migration */ }

  return NextResponse.json({ spots: out, photos: photos ?? [], proposedDests: proposedDests ?? [], edits, jibe: { toStructure, toMerge, toIntake, lastRun } });
}
