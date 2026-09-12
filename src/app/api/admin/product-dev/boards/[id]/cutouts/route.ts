import { NextRequest, NextResponse } from "next/server";
import { pdDb, pdReplaceChildren } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";

const CUTOUT_COLUMNS = [
  "kind", "label", "station_from", "station_to", "offset_cm", "mirrored",
  "width_cm", "depth_mm", "angle_deg", "spec", "notes", "sort_order",
] as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const { data, error } = await pdDb().from("pd_board_cutouts").select("*").eq("board_id", id).order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** PUT — replace the whole list, renumbered in the order given. The table is
 *  short and reordering is the common edit, same as the plies and the steps. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { cutouts?: Record<string, unknown>[] };
  const rows = (Array.isArray(body.cutouts) ? body.cutouts : []).map((c, i) => ({ ...c, sort_order: i }));
  return pdReplaceChildren({
    table: "pd_board_cutouts",
    parentColumn: "board_id",
    parentId: id,
    rows,
    editable: CUTOUT_COLUMNS,
    request,
  });
}
