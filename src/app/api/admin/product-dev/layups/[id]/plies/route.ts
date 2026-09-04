import { NextRequest, NextResponse } from "next/server";
import { pdDb, pdReplaceChildren } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
const PLY_COLUMNS = ["ply_index", "material_id", "orientation", "template_ref", "length_cm", "width_mm", "stack", "note"] as const;

// GET /api/admin/product-dev/layups/:id/plies
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const { data, error } = await pdDb().from("pd_layup_plies").select("*").eq("layup_id", id).order("ply_index");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * PUT — replace the whole ply table for this layup.
 *
 * Whole-table rather than per-row because that is how the editor works: insert
 * a ply in the middle and every index below it shifts, so a row-by-row save
 * would fight the `unique (layup_id, ply_index)` constraint on the way through.
 *
 * The rows arrive in the order the grid shows them and are renumbered from 1
 * here, so ply_index always matches what is printed on the drawing. NOTE the
 * lengths are NOT sorted: the taper restarts at every stack boundary, and
 * "fixing" that ordering would destroy the record.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { plies?: Record<string, unknown>[] };
  const incoming = Array.isArray(body.plies) ? body.plies : [];

  const missing = incoming.findIndex((p) => !p.material_id);
  if (missing >= 0) {
    return NextResponse.json({ error: `Ply ${missing + 1} has no material.` }, { status: 400 });
  }

  const rows = incoming.map((p, i) => ({ ...p, ply_index: i + 1 }));
  return pdReplaceChildren({
    table: "pd_layup_plies",
    parentColumn: "layup_id",
    parentId: id,
    rows,
    editable: PLY_COLUMNS,
    request,
  });
}
