import { NextRequest, NextResponse } from "next/server";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";

/**
 * POST /api/admin/product-dev/layups/:id/duplicate
 *
 * Build sheets are variations on each other far more often than they are
 * written from scratch — the 8.3 and the 8.6 differ by a few ply lengths, not by
 * eighteen decisions. Re-entering the whole stack by hand for every mold is the
 * single most tedious thing in this section, so a new sheet starts as a copy of
 * a real one and gets edited down.
 *
 * Body: { construction_id, mold_id, name?, ref? } — the pair the copy is FOR.
 * Everything else (geometry, resin window, plies, source) comes from the origin.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePdEdit();
  if (denied) return denied;

  const db = pdDb();
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    construction_id?: string; mold_id?: string; name?: string; ref?: string | null;
  };
  if (!body.construction_id || !body.mold_id) {
    return NextResponse.json({ error: "Pick a construction and a mold for the copy." }, { status: 400 });
  }

  const { data: src, error: srcErr } = await db.from("pd_layups").select("*").eq("id", id).single();
  if (srcErr || !src) return NextResponse.json({ error: "Couldn't find the sheet to copy." }, { status: 404 });

  const { data: created, error } = await db.from("pd_layups").insert({
    project_id: src.project_id,
    construction_id: body.construction_id,
    mold_id: body.mold_id,
    name: body.name?.trim() || `${src.name} (copy)`,
    ref: body.ref ?? null,
    revision: 1,
    // A copy is never the quoting reference — that is a deliberate act on one
    // specific sheet, and inheriting it would silently give you two.
    is_reference: false,
    resin_pct_min: src.resin_pct_min,
    resin_pct_max: src.resin_pct_max,
    geometry: src.geometry ?? {},
    notes: src.notes,
    source_id: src.source_id,
  }).select().single();

  if (error) {
    // 23505 = the unique (project, mold, construction) constraint: that pair
    // already has a sheet, which is exactly what the matrix is meant to prevent.
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "That construction and mold already have a build sheet." : error.message },
      { status: dup ? 409 : 400 }
    );
  }

  const { data: plies } = await db.from("pd_layup_plies").select("*").eq("layup_id", id).order("ply_index");
  const rows = (plies ?? []) as { ply_index: number; material_id: string; orientation: string | null; template_ref: string | null; length_cm: number | null; width_mm: number | null; stack: string | null; note: string | null }[];

  if (rows.length) {
    const { error: plyErr } = await db.from("pd_layup_plies").insert(rows.map((p) => ({
      layup_id: created.id,
      ply_index: p.ply_index, material_id: p.material_id, orientation: p.orientation,
      template_ref: p.template_ref, length_cm: p.length_cm, width_mm: p.width_mm,
      stack: p.stack, note: p.note,
    })));
    if (plyErr) {
      // The header exists but the stack didn't copy — say so plainly rather than
      // handing back an empty sheet that looks deliberate.
      return NextResponse.json(
        { id: created.id, warning: `Sheet created, but the plies didn't copy: ${plyErr.message}` },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ id: created.id, plies: rows.length });
}
