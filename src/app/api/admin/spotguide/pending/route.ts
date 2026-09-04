import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { EDIT_FIELD_LABEL, humanEditValue, type EditableField } from "@/lib/spotguide-trust";
import { COMMUNITY_VERIFY_THRESHOLD } from "@/lib/spotguide";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/spotguide/pending — member-submitted spots awaiting review +
// member photos awaiting moderation, for the Spotguide moderation page.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // NOTE: we deliberately do NOT filter on `verification` here. A decision has
  // to actually stick — "Approve (community)" used to leave the spot matching
  // `verification != np7`, so it reappeared on every reload. Instead we pull all
  // member/jibe spots and keep only what still needs a human below (undecided,
  // or flagged at any verification level).
  const { data: spots, error } = await db
    .from("spots")
    .select("id, name, destination_id, level, conditions, description, verification, status, created_at, source, submitted_by, lat, lng")
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

  // Who put it there. A card without a proposer made the queue read like the
  // system invented the spot — it was either the jibe intake (it did) or a
  // member whose name simply wasn't shown.
  const submitterIds = [...new Set((spots ?? []).map((s: { submitted_by?: string | null }) => s.submitted_by).filter(Boolean))] as string[];
  const { data: submitters } = submitterIds.length
    ? await db.from("contacts").select("id, name").in("id", submitterIds)
    : { data: [] };
  const submitterName = new Map((submitters ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  // Tag each pending spot so the admin surfaces only what needs a human: FLAGGED
  // (riders reported it wrong) or STUCK (no one's confirmed it after a few days —
  // early on, when there's no community yet, this catches everything so nothing
  // rots). The rest just wait for the crowd. Needs-attention sorts to the top.
  const STUCK_DAYS = 3;
  const mapped = (spots ?? []).map((s: Record<string, unknown>) => {
    const vs = (verifs ?? []).filter((v: { spot_id: string }) => v.spot_id === s.id);
    const confirms = vs.filter((v: { kind: string }) => v.kind === "confirm").length;
    const flags = vs.filter((v: { kind: string }) => v.kind === "flag").length;
    // the "why" behind each flag — the reasons riders typed when flagging
    const flagReasons = vs.filter((v: { kind: string; note?: string | null }) => v.kind === "flag" && v.note && String(v.note).trim())
      .map((v: { note?: string | null }) => String(v.note).trim());
    const ageDays = Math.floor((Date.now() - new Date(String(s.created_at)).getTime()) / 86_400_000);
    const flagged = flags > 0;
    const stuck = !flagged && ageDays >= STUCK_DAYS && confirms < COMMUNITY_VERIFY_THRESHOLD;
    const proposer = s.source === "jibe"
      ? "jibe (agent) — from Nico's videos"
      : (s.submitted_by && submitterName.get(s.submitted_by as string)) || "A member";
    // A spot with no coordinates publishes fine and then simply isn't on the
    // map — the map query drops it and nothing says why. Surface it BEFORE the
    // approve click, which is the only moment anyone can act on it.
    const noPin = s.lat == null || s.lng == null;
    return { ...s, destinationName: destName.get(s.destination_id as string) ?? "—", proposer, noPin, confirms, flags, flagReasons, ageDays, flagged, stuck };
  });
  // Hidden contributions vanish from the queue by design — but then there is no
  // way back to them, which is how a spot ends up unfindable after a Hide.
  // Return them separately so the UI can offer a restore.
  const hidden = mapped.filter((s: { status: string }) => s.status === "hidden");
  const queue = mapped.filter((s: { flagged: boolean; verification: string; status: string }) =>
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
    .select("id, spot_id, contact_id, field, old_value, new_value, note, status, created_at, source")
    .in("status", ["pending", "approved"]).order("created_at", { ascending: false });
  let edits: Record<string, unknown>[] = [];
  if (rawEdits && rawEdits.length) {
    const eSpotIds = [...new Set(rawEdits.map((e: { spot_id: string }) => e.spot_id))];
    const eContactIds = [...new Set(rawEdits.map((e: { contact_id: string | null }) => e.contact_id).filter(Boolean))] as string[];
    const [{ data: eSpots }, { data: eContacts }] = await Promise.all([
      db.from("spots").select("id, name").in("id", eSpotIds),
      db.from("contacts").select("id, name").in("id", eContactIds),
    ]);
    const spotName = new Map((eSpots ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    const who = new Map((eContacts ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    edits = rawEdits.map((e: Record<string, unknown>) => ({
      id: e.id, spotId: e.spot_id, spotName: spotName.get(e.spot_id as string) ?? "—",
      // A machine proposal is not a member's — say so, so it can be held to
      // a different bar rather than blending into the community queue.
      proposer: e.source === "jibe" ? "jibe (agent)" : who.get(e.contact_id as string) ?? "A member",
      source: e.source ?? "member",
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

  return NextResponse.json({ spots: queue, hiddenSpots: hidden, photos: photos ?? [], proposedDests: proposedDests ?? [], edits, jibe: { toStructure, toMerge, toIntake, lastRun } });
}
