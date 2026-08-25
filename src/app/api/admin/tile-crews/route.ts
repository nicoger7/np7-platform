import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/admin/tile-crews — the resolved tile crew per experience, mirroring
 * the public card logic exactly: exp_content.tile_coaches override first, else
 * the next edition's exp_edition_coaches in LIST order (the team orders that
 * list deliberately); extras need a cutout; cap 3.
 *
 * Exists because the Experiences overview fronted ONE global fallback coach on
 * every tile — alphabetically Dennis — which lied about who coaches what.
 */
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: exps }, { data: eds }, { data: coaches }, { data: contentRows }] = await Promise.all([
    db.from("exp_experiences").select("id"),
    db.from("exp_editions").select("id,experience_id,date_start").order("date_start"),
    db.from("exp_coaches").select("id,name,cutout_url"),
    db.from("exp_content").select("experience_id,tile_coaches"),
  ]);

  type Crew = { name: string; cutout: string | null };
  const coachById = new Map<string, Crew>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((coaches ?? []) as any[]).map((c) => [c.id, { name: c.name, cutout: c.cutout_url ?? null }]),
  );

  // The tile shows the NEXT week's team (or the most recent one, once a season
  // is over — an all-past experience keeps its real crew, not a fallback).
  const nextEd = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (exps ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((eds ?? []) as any[]).filter((x) => x.experience_id === e.id && x.date_start);
    const next = list.find((x) => x.date_start >= today) ?? list[list.length - 1];
    if (next) nextEd.set(e.id, next.id);
  }

  const crewByEdition = new Map<string, Crew[]>();
  const edIds = [...nextEd.values()];
  if (edIds.length) {
    const { data: ec } = await db
      .from("exp_edition_coaches")
      .select("edition_id,sort_order,name_override,exp_coaches(name,cutout_url)")
      .in("edition_id", edIds)
      .order("sort_order");
    const raw = new Map<string, Crew[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (ec ?? []) as any[]) {
      const name = r.name_override ?? r.exp_coaches?.name ?? "";
      if (!name) continue;
      raw.set(r.edition_id, [...(raw.get(r.edition_id) ?? []), { name, cutout: r.exp_coaches?.cutout_url ?? null }]);
    }
    for (const [edId, list] of raw) {
      const lead = list[0];
      const extras = list.slice(1).filter((c) => c.cutout).slice(0, 2);
      if (lead) crewByEdition.set(edId, [lead, ...extras]);
    }
  }

  const overrides = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (contentRows ?? []) as any[]) {
    if (Array.isArray(r.tile_coaches) && r.tile_coaches.length) {
      overrides.set(r.experience_id, r.tile_coaches.filter((x: unknown) => typeof x === "string"));
    }
  }

  const out: Record<string, Crew[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (exps ?? []) as any[]) {
    const ids = overrides.get(e.id);
    if (ids?.length) {
      const crew = ids.map((id) => coachById.get(id)).filter((x): x is Crew => Boolean(x)).slice(0, 3);
      if (crew.length) { out[e.id] = crew; continue; }
    }
    const edId = nextEd.get(e.id);
    const crew = edId ? crewByEdition.get(edId) : undefined;
    if (crew?.length) out[e.id] = crew;
  }
  return NextResponse.json(out);
}
