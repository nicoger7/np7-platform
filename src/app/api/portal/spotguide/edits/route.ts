import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { LEVELS, CONDITIONS, conditionLabel } from "@/lib/spotguide";
import { EDITABLE_FIELDS, EDIT_CONFIRMS_REQUIRED, getStanding, resolveEdit, type EditableField } from "@/lib/spotguide-trust";

/**
 * Member-suggested edits to an existing spot's editorial fields. A proposal
 * lands pending and resolves per the proposer's standing (moderator applies at
 * once; local specialist needs 1 confirm; everyone else 3) — see spotguide-trust.
 */

const FIELD_LABEL: Record<EditableField, string> = {
  name: "Spot name", summary: "Summary", description: "Description",
  pin: "Pin location", level: "Level", conditions: "Conditions",
};

// Validate + normalise a proposed value for a field. Returns undefined if invalid.
function cleanValue(field: EditableField, raw: unknown): unknown | undefined {
  if (field === "name") { const v = String(raw ?? "").trim(); return v.length >= 2 ? v.slice(0, 120) : undefined; }
  if (field === "summary") return String(raw ?? "").trim().slice(0, 240);
  if (field === "description") return String(raw ?? "").trim().slice(0, 4000);
  if (field === "level") return (LEVELS as readonly string[]).includes(String(raw)) ? raw : undefined;
  if (field === "conditions") return Array.isArray(raw) ? raw.filter((c) => CONDITIONS.some((x) => x.key === c)) : undefined;
  if (field === "pin") {
    const v = raw as { lat?: unknown; lng?: unknown };
    const lat = Number(v?.lat), lng = Number(v?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 } : undefined;
  }
  return undefined;
}

function humanValue(field: string, v: unknown): string {
  if (field === "pin") { const p = v as { lat?: number; lng?: number }; return p?.lat != null ? `${p.lat}, ${p.lng}` : "—"; }
  if (field === "conditions") return Array.isArray(v) ? v.map((c) => conditionLabel(String(c))).join(" · ") : "—";
  return v == null || v === "" ? "—" : String(v);
}

// GET /api/portal/spotguide/edits?dest=<id> — pending edits on a destination's
// spots, so members can help confirm them.
export async function GET(request: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ loggedIn: false, edits: [] });
  const dest = (request.nextUrl.searchParams.get("dest") ?? "").trim();
  if (!dest) return NextResponse.json({ loggedIn: true, edits: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: destSpots } = await db.from("spots").select("id, name").eq("destination_id", dest);
  const nameById = new Map<string, string>((destSpots ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const spotIds = [...nameById.keys()];
  if (spotIds.length === 0) return NextResponse.json({ loggedIn: true, edits: [] });

  const { data: edits, error } = await db.from("spot_edits")
    .select("id, spot_id, contact_id, field, old_value, new_value, note, created_at")
    .in("spot_id", spotIds).eq("status", "pending").order("created_at", { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ loggedIn: true, edits: [] });
    return NextResponse.json({ error: "Could not load edits." }, { status: 500 });
  }
  const ids = (edits ?? []).map((e: { id: string }) => e.id);
  const { data: confs } = ids.length ? await db.from("spot_edit_confirms").select("edit_id, contact_id, kind").in("edit_id", ids) : { data: [] };

  const out = await Promise.all((edits ?? []).map(async (e: Record<string, unknown>) => {
    const cs = (confs ?? []).filter((c: { edit_id: string }) => c.edit_id === e.id);
    const author = await getStanding(db, e.contact_id as string, dest);
    const required = author.moderator ? EDIT_CONFIRMS_REQUIRED.moderator : author.specialist ? EDIT_CONFIRMS_REQUIRED.specialist : EDIT_CONFIRMS_REQUIRED.member;
    return {
      id: e.id, spotName: nameById.get(e.spot_id as string) ?? "a spot",
      field: e.field, fieldLabel: FIELD_LABEL[e.field as EditableField] ?? e.field,
      from: humanValue(e.field as string, e.old_value), to: humanValue(e.field as string, e.new_value),
      note: e.note ?? null,
      isOwn: e.contact_id === user.contactId,
      confirms: cs.filter((c: { kind: string }) => c.kind === "confirm").length, required,
      iConfirmed: cs.some((c: { contact_id: string; kind: string }) => c.contact_id === user.contactId && c.kind === "confirm"),
    };
  }));
  return NextResponse.json({ loggedIn: true, edits: out });
}

// POST /api/portal/spotguide/edits — propose an edit. Body { spotId, field, value, note? }
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to suggest an edit." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const spotId = (body.spotId ?? "").trim();
  const field = body.field as EditableField;
  if (!spotId || !EDITABLE_FIELDS.includes(field)) return NextResponse.json({ error: "Invalid edit." }, { status: 400 });
  const value = cleanValue(field, body.value);
  if (value === undefined) return NextResponse.json({ error: "That value isn't valid." }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 600) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: spot } = await db.from("spots").select("id, name, summary, description, level, conditions, lat, lng").eq("id", spotId).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });

  const oldValue = field === "pin" ? { lat: spot.lat, lng: spot.lng }
    : field === "conditions" ? (spot.conditions ?? [])
    : spot[field] ?? null;

  const { data: inserted, error } = await db.from("spot_edits").insert({
    spot_id: spotId, contact_id: user.contactId, field, old_value: oldValue, new_value: value, note,
    status: "pending",
  }).select("id").single();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save your suggestion." }, { status: 500 });
  }

  // A moderator's edit applies immediately; others wait for confirmations.
  const res = await resolveEdit(db, inserted.id);
  return NextResponse.json({ ok: true, id: inserted.id, applied: res.applied, status: res.status }, { status: 201 });
}
