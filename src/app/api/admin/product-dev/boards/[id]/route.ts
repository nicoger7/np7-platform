import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdPatch, pdDelete } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
const CFG = PD_ENTITIES.boards;

/**
 * GET /api/admin/product-dev/boards/:id — the whole board in one call.
 *
 * Same reasoning as the project bundle: measurements, cut-outs, the building
 * process and the note inbox are tabs of ONE document, and a fully measured
 * board is a few hundred rows. Five round trips on every tab click would buy
 * nothing.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const db = pdDb();
  const { id } = await params;

  const { data: board, error } = await db.from("pd_boards").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // No building process here: "building sits in projects, not in measured
  // boards" (Nico). A measured competitor board has no build; ours is on its
  // R&D project. pd_processes.board_id stays in the schema, unused by this UI.
  const [series, points, cutouts, notes, project] = await Promise.all([
    db.from("pd_board_series").select("*").eq("board_id", id).order("sort_order"),
    db.from("pd_board_points").select("*").eq("board_id", id).order("metric").order("station"),
    db.from("pd_board_cutouts").select("*").eq("board_id", id).order("sort_order"),
    db.from("pd_board_notes").select("*").eq("board_id", id).order("created_at", { ascending: false }),
    board.project_id
      ? db.from("pd_projects").select("id,name,kind").eq("id", board.project_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    ...board,
    series: series.data ?? [],
    points: points.data ?? [],
    cutouts: cutouts.data ?? [],
    // `note_rows`, not `notes`: the board row spread above already carries a
    // `notes` TEXT column, and the inbox must not overwrite it.
    note_rows: notes.data ?? [],
    project: project.data ?? null,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  return pdPatch(CFG, request, id);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  return pdDelete(CFG, id);
}
