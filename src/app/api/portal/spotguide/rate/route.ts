import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import {
  SPOT_CRITERIA_KEYS, DESTINATION_CRITERIA_KEYS, summariseRatings,
  LEVELS, CONDITIONS, INFRASTRUCTURE_TAGS, asWindWindow, windWindowHasValue,
  crowdWindow, levelConsensus, conditionsTally, infraTally,
} from "@/lib/spotguide";

/**
 * POST /api/portal/spotguide/rate — a member rates a spot or destination (one
 * row per member, upserted). For SPOTS the member also contributes crowd facts:
 * the level it suits, the conditions they saw, and the wind directions that
 * worked (a windrose). Body:
 *   spot:        { target:'spot', id, ratings, level?, conditions?, wind_window? }
 *   destination: { target:'destination', id, ratings }
 * Returns refreshed member averages + crowd facts.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to rate." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const target = body.target === "destination" ? "destination" : "spot";
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const keys = target === "spot" ? SPOT_CRITERIA_KEYS : DESTINATION_CRITERIA_KEYS;
  const ratings: Record<string, number> = {};
  for (const k of keys) {
    const n = Math.round(Number((body.ratings ?? {})[k]));
    if (n >= 1 && n <= 5) ratings[k] = n;
  }
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1200) : null;

  // spot-only crowd facts. A member can now say a spot suits SEVERAL levels
  // (`levels`); `level` stays as the primary (first pick) for back-compat.
  const levels = target === "spot" && Array.isArray(body.levels)
    ? body.levels.filter((l: string) => (LEVELS as readonly string[]).includes(l)) : [];
  const level = levels[0] ?? (target === "spot" && LEVELS.includes(body.level) ? body.level : null);
  const conditions = target === "spot" && Array.isArray(body.conditions)
    ? body.conditions.filter((c: string) => CONDITIONS.some((x) => x.key === c)) : [];
  const infrastructure = target === "spot" && Array.isArray(body.infrastructure)
    ? body.infrastructure.filter((t: string) => (INFRASTRUCTURE_TAGS as readonly string[]).includes(t)) : [];
  const wind_window = asWindWindow(body.wind_window); // {} for destinations (no body.wind_window)

  const hasAnyInput = Object.keys(ratings).length > 0 || levels.length > 0 || !!level || conditions.length > 0 || infrastructure.length > 0 || (target === "spot" && windWindowHasValue(wind_window));
  if (!hasAnyInput) return NextResponse.json({ error: "Add at least one rating or fact." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const table = target === "spot" ? "spot_ratings" : "destination_ratings";
  const fk = target === "spot" ? "spot_id" : "destination_id";

  const row: Record<string, unknown> = { [fk]: id, contact_id: user.contactId, ratings, comment, updated_at: new Date().toISOString() };
  if (target === "spot") { row.level = level; row.levels = levels; row.conditions = conditions; row.wind_window = wind_window; row.infrastructure = infrastructure; }

  let { error } = await db.from(table).upsert(row, { onConflict: `${fk},contact_id` });
  // Tolerate optional columns not existing yet (migration 081 infrastructure, 084
  // levels): drop whichever the error names and retry so rating still saves —
  // that fact just isn't recorded until the migration is applied.
  for (const col of ["infrastructure", "levels"] as const) {
    if (error && new RegExp(`\\b${col}\\b`, "i").test(error.message) && col in row) {
      delete row[col];
      ({ error } = await db.from(table).upsert(row, { onConflict: `${fk},contact_id` }));
    }
  }
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save your rating." }, { status: 500 });
  }

  if (target === "spot") {
    const { data: rows } = await db.from(table).select("*").eq(fk, id);
    return NextResponse.json({
      ok: true,
      summary: summariseRatings(rows ?? [], keys),
      level: levelConsensus(rows ?? []),
      conditions: conditionsTally(rows ?? []),
      infrastructure: infraTally(rows ?? []),
      windrose: crowdWindow(rows ?? []),
      mine: { ratings, level, levels, conditions, wind_window, infrastructure },
    });
  }
  const { data: rows } = await db.from(table).select("ratings").eq(fk, id);
  return NextResponse.json({ ok: true, summary: summariseRatings(rows ?? [], keys), mine: { ratings } });
}
