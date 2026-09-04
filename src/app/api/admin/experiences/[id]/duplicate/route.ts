import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
const STRIP = new Set(["id", "created_at", "updated_at", "notion_id"]);

function rand() {
  return Math.random().toString(36).slice(2, 6);
}
function strip(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!STRIP.has(k)) out[k] = v;
  return out;
}

// POST /api/admin/experiences/:id/duplicate
// Copies the experience TEMPLATE + its components. Editions are NOT copied.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const { data: original, error } = await db.from("exp_experiences").select("*").eq("id", id).single();
  if (error || !original) return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });

  const copy = strip(original);
  copy.title = `${original.title} (copy)`;
  copy.slug = `${original.slug}-copy-${rand()}`;
  copy.status = "draft";

  const { data: created, error: insErr } = await db.from("exp_experiences").insert(copy).select("*").single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // Copy experience-scoped components (drop edition links — editions aren't copied).
  const { data: comps } = await db.from("exp_components").select("*").eq("experience_id", id);
  if (comps?.length) {
    const rows = comps.map((c: Record<string, unknown>) => ({ ...strip(c), experience_id: created.id, edition_id: null }));
    await db.from("exp_components").insert(rows);
  }

  return NextResponse.json(created, { status: 201 });
}
