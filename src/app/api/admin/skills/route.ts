import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { rankForDifficulty } from "@/lib/progression";

// Admin CRUD for the skills catalog (level_milestones). Lets the team add /
// edit / reorder / retire the skills that drive the member Progress ladder,
// without a migration. Rank is derived from `difficulty`; the legacy `tier`
// column is kept consistent automatically.

const SLUG = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clean(body: any) {
  const difficulty = Number.isFinite(Number(body.difficulty)) ? Math.max(1, Math.round(Number(body.difficulty))) : 10;
  return {
    label: typeof body.label === "string" ? body.label.trim() : "",
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    discipline: typeof body.discipline === "string" && body.discipline ? body.discipline : "side",
    difficulty,
    prerequisite_key: typeof body.prerequisite_key === "string" && body.prerequisite_key ? body.prerequisite_key : null,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Math.round(Number(body.sort_order)) : difficulty,
    active: body.active !== false,
    tier: rankForDifficulty(difficulty),
  };
}

// GET → all catalog skills (active + retired), for the admin editor.
export async function GET() {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("level_milestones").select("*").order("discipline").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ skills: data ?? [] });
}

// POST { label, description, discipline, difficulty, prerequisite_key, sort_order } → create
export async function POST(request: NextRequest) {
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

  const { data, error } = await db.from("level_milestones").insert({ key, ...fields }).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ skill: data });
}

// PATCH { id, ...fields } → update one skill (incl. active toggle)
export async function PATCH(request: NextRequest) {
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
