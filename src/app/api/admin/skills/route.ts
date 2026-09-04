import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { RANKS } from "@/lib/progression";
import { requireAdminGate } from "@/lib/admin-auth";
// Admin CRUD for the skills catalog (level_milestones). The team adds / edits /
// re-ranks / reorders / retires the skills that drive the member Progress ladder.
// A skill's RANK (Beginner…Pro) is stored directly — set by dropping the skill
// into a band in the editor. The legacy `tier` column is kept in sync (the member
// level-suggestion still reads it), and a representative `difficulty` is written
// for back-compat until that column is dropped.

const SLUG = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const RANK_SET = new Set<string>(RANKS);
// A representative difficulty per rank — keeps the legacy `difficulty` column
// plausible/consistent during the transition. Ignored by the engine (it reads rank).
const RANK_MID: Record<string, number> = { Beginner: 10, Intermediate: 22, Advanced: 40, Expert: 55, "Semi-Pro": 75, Pro: 95 };
const normRank = (r: unknown): string => (typeof r === "string" && RANK_SET.has(r) ? r : "Beginner");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clean(body: any) {
  const rank = normRank(body.rank);
  return {
    label: typeof body.label === "string" ? body.label.trim() : "",
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    discipline: typeof body.discipline === "string" && body.discipline ? body.discipline : "side",
    rank,
    tier: rank,
    difficulty: RANK_MID[rank],
    prerequisite_key: typeof body.prerequisite_key === "string" && body.prerequisite_key ? body.prerequisite_key : null,
    active: body.active !== false,
  };
}

// GET → all catalog skills (active + retired), for the admin editor.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("level_milestones").select("*").order("discipline").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ skills: data ?? [] });
}

// POST { label, description, discipline, rank, prerequisite_key } → create.
// New skills append to the end of their track (sort_order = max + 10).
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const body = await request.json().catch(() => ({}));
  const fields = clean(body);
  if (!fields.label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Stable, unique key: caller may pass one, else derive from the label + suffix.
  let key = typeof body.key === "string" && body.key ? SLUG(body.key) : SLUG(fields.label);
  if (!key) key = `skill_${Date.now()}`;
  const { data: clash } = await db.from("level_milestones").select("id").eq("key", key).maybeSingle();
  if (clash) key = `${key}_${Math.random().toString(36).slice(2, 6)}`;

  // Append after the current last skill in this track.
  const { data: last } = await db.from("level_milestones").select("sort_order").eq("discipline", fields.discipline).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (Number.isFinite(last?.sort_order) ? Number(last.sort_order) : 0) + 10;

  const { data, error } = await db.from("level_milestones").insert({ key, ...fields, sort_order }).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ skill: data });
}

// PATCH { id, ...fields } → update one skill (name/description/track/rank/prereq/active).
export async function PATCH(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const fields = clean(body);
  if (!fields.label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // A skill can't be its own prerequisite.
  const { data: self } = await db.from("level_milestones").select("key").eq("id", id).maybeSingle();
  if (self && fields.prerequisite_key === self.key) fields.prerequisite_key = null;

  const { data, error } = await db.from("level_milestones").update(fields).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ skill: data });
}

// PUT { updates: [{ id, rank, sort_order }] } → batch move/reorder from the
// drag-into-band editor. Sets each skill's rank (+ keeps tier/difficulty aligned)
// and its position within the track.
export async function PUT(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const body = await request.json().catch(() => ({}));
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  if (!updates.length) return NextResponse.json({ error: "No updates" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let count = 0;
  for (const u of updates) {
    if (!u || typeof u.id !== "string" || !RANK_SET.has(u.rank)) continue;
    const sort_order = Number.isFinite(Number(u.sort_order)) ? Math.round(Number(u.sort_order)) : 0;
    const { error } = await db.from("level_milestones")
      .update({ rank: u.rank, tier: u.rank, difficulty: RANK_MID[u.rank], sort_order })
      .eq("id", u.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    count++;
  }
  return NextResponse.json({ ok: true, count });
}
