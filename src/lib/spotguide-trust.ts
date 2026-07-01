import { fetchWindStats } from "./wind-stats";
import { slugifySpot, conditionLabel } from "./spotguide";

/**
 * Spotguide contributor trust + the member "suggest an edit" resolution engine.
 *
 * Truth model (see migration 066):
 *   • Facts (ratings, level/condition tallies, wind window) aggregate — never here.
 *   • Wind statistics compute from the pin — never here.
 *   • Editorial fields (name, pin, text…) have ONE canonical value, so a change
 *     to them is a verifiable *edit*, resolved by the proposer's standing:
 *       - moderator  (global, NP7-granted)          → applies immediately
 *       - specialist (per-destination, granted OR    → needs 1 confirm
 *         earned from demonstrated local activity)
 *       - member     (everyone else)                 → needs 3 confirms
 *     …and a single confirm FROM a specialist/moderator is enough on its own.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export const EDITABLE_FIELDS = ["name", "summary", "description", "pin", "level", "conditions"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const EDIT_FIELD_LABEL: Record<EditableField, string> = {
  name: "Spot name", summary: "Summary", description: "Description",
  pin: "Pin location", level: "Level", conditions: "Conditions",
};

/** Render a stored field value for display in review UIs. */
export function humanEditValue(field: string, v: unknown): string {
  if (field === "pin") { const p = v as { lat?: number; lng?: number }; return p?.lat != null ? `${p.lat}, ${p.lng}` : "—"; }
  if (field === "conditions") return Array.isArray(v) ? v.map((c) => conditionLabel(String(c))).join(" · ") || "—" : "—";
  return v == null || v === "" ? "—" : String(v);
}

// Tunable criteria. Earned local-specialist standing at a destination requires
// demonstrated local knowledge: rated enough distinct spots there AND at least
// one accepted contribution (a spot they added that went live, or enough
// confirmations given there).
export const SPECIALIST_MIN_RATED_SPOTS = 3;
export const SPECIALIST_MIN_CONFIRMS = 3;
export const EDIT_CONFIRMS_REQUIRED = { member: 3, specialist: 1, moderator: 0 } as const;

export type Standing = { moderator: boolean; specialist: boolean };

/** A contributor's standing. `moderator` is global (NP7-granted → trusted
    everywhere). `specialist` is evaluated for `destId` — NP7-granted OR earned
    from activity there. */
export async function getStanding(db: DB, contactId: string | null | undefined, destId?: string | null): Promise<Standing> {
  if (!contactId) return { moderator: false, specialist: false };
  const { data: grants } = await db.from("spotguide_trust").select("role, destination_id").eq("contact_id", contactId);
  const rows: { role: string; destination_id: string | null }[] = grants ?? [];
  if (rows.some((g) => g.role === "moderator")) return { moderator: true, specialist: true };
  if (!destId) return { moderator: false, specialist: false };
  if (rows.some((g) => g.role === "specialist" && g.destination_id === destId)) return { moderator: false, specialist: true };
  return { moderator: false, specialist: await earnedSpecialist(db, contactId, destId) };
}

async function earnedSpecialist(db: DB, contactId: string, destId: string): Promise<boolean> {
  const { data: destSpots } = await db.from("spots").select("id").eq("destination_id", destId);
  const ids: string[] = (destSpots ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return false;

  const { data: rated } = await db.from("spot_ratings").select("spot_id").eq("contact_id", contactId).in("spot_id", ids);
  const distinctRated = new Set((rated ?? []).map((r: { spot_id: string }) => r.spot_id)).size;
  if (distinctRated < SPECIALIST_MIN_RATED_SPOTS) return false;

  // accepted contribution #1 — a spot they submitted here that reached the public
  const { data: mySpot } = await db.from("spots")
    .select("id").eq("destination_id", destId).eq("submitted_by", contactId)
    .in("verification", ["community", "np7"]).limit(1);
  if ((mySpot ?? []).length > 0) return true;

  // accepted contribution #2 — enough confirmations given on spots here
  const { data: myConfirms } = await db.from("spot_verifications")
    .select("spot_id").eq("contact_id", contactId).eq("kind", "confirm").in("spot_id", ids);
  const distinctConfirms = new Set((myConfirms ?? []).map((r: { spot_id: string }) => r.spot_id)).size;
  return distinctConfirms >= SPECIALIST_MIN_CONFIRMS;
}

type SpotRow = { id: string; destination_id: string; wind_stats: { source?: string } | null };

/** Write an approved edit's value onto the spot. Moving the pin re-computes the
    wind climatology unless a manual "NP7 · local knowledge" override protects it. */
export async function applyEditToSpot(db: DB, spot: SpotRow, field: string, newValue: unknown): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (field === "name") { patch.name = String(newValue).slice(0, 120); patch.slug = slugifySpot(String(newValue)); }
  else if (field === "summary") patch.summary = String(newValue).slice(0, 240);
  else if (field === "description") patch.description = String(newValue).slice(0, 4000);
  else if (field === "level") patch.level = newValue;
  else if (field === "conditions") patch.conditions = Array.isArray(newValue) ? newValue : [];
  else if (field === "pin") {
    const v = newValue as { lat?: unknown; lng?: unknown };
    const lat = Number(v?.lat), lng = Number(v?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) { patch.lat = lat; patch.lng = lng; }
  }
  await db.from("spots").update(patch).eq("id", spot.id);

  if (field === "pin" && patch.lat != null && !String(spot.wind_stats?.source ?? "").startsWith("NP7")) {
    try {
      const stats = await fetchWindStats(patch.lat as number, patch.lng as number);
      await db.from("spots").update({ wind_stats: stats, wind_stats_at: new Date().toISOString() }).eq("id", spot.id);
    } catch { /* the wind-stats cron will retry */ }
  }
}

export type EditResolution = { status: string; applied: boolean; confirms: number; required: number };

/** Recount an edit's confirms and apply it if the bar (per author standing, or a
    single trusted confirm) is met. Safe to call after propose and after each
    confirm. */
export async function resolveEdit(db: DB, editId: string): Promise<EditResolution> {
  const { data: edit } = await db.from("spot_edits").select("*").eq("id", editId).maybeSingle();
  if (!edit || edit.status !== "pending") return { status: edit?.status ?? "gone", applied: false, confirms: 0, required: 0 };
  const { data: spot } = await db.from("spots").select("id, destination_id, wind_stats").eq("id", edit.spot_id).maybeSingle();
  if (!spot) return { status: "gone", applied: false, confirms: 0, required: 0 };

  const { data: confirmRows } = await db.from("spot_edit_confirms").select("contact_id, kind").eq("edit_id", editId);
  const confirmers = [...new Set((confirmRows ?? []).filter((r: { kind: string }) => r.kind === "confirm").map((r: { contact_id: string }) => r.contact_id))] as string[];

  const author = await getStanding(db, edit.contact_id, spot.destination_id);
  const required = author.moderator ? EDIT_CONFIRMS_REQUIRED.moderator
    : author.specialist ? EDIT_CONFIRMS_REQUIRED.specialist
    : EDIT_CONFIRMS_REQUIRED.member;

  let apply = confirmers.length >= required;
  if (!apply) {
    for (const cid of confirmers) {
      const st = await getStanding(db, cid, spot.destination_id);
      if (st.moderator || st.specialist) { apply = true; break; }
    }
  }
  if (!apply) return { status: "pending", applied: false, confirms: confirmers.length, required };

  await applyEditToSpot(db, spot, edit.field, edit.new_value);
  await db.from("spot_edits").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", editId);
  // other pending edits to the same field are now stale
  await db.from("spot_edits").update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("spot_id", edit.spot_id).eq("field", edit.field).eq("status", "pending").neq("id", editId);
  return { status: "applied", applied: true, confirms: confirmers.length, required };
}
