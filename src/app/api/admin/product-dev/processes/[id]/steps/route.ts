import { NextRequest, NextResponse } from "next/server";
import { pdDb, pdReplaceChildren } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
const STEP_COLUMNS = [
  "step_no", "title", "body", "equipment",
  "temp_c_min", "temp_c_max", "pressure_t_min", "pressure_t_max", "duration_min",
  "params", "materials", "critical", "tolerance_target", "tolerance_unit", "tolerance_note",
  "photos", "source_id",
] as const;

// GET /api/admin/product-dev/processes/:id/steps
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const { data, error } = await pdDb().from("pd_process_steps").select("*").eq("process_id", id).order("step_no");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PUT — replace the whole step list, renumbered from 1 in the order given.
// Same whole-table reasoning as the plies: reordering steps is the common edit.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { steps?: Record<string, unknown>[] };
  const incoming = Array.isArray(body.steps) ? body.steps : [];

  const untitled = incoming.findIndex((s) => !s.title);
  if (untitled >= 0) {
    return NextResponse.json({ error: `Step ${untitled + 1} has no title.` }, { status: 400 });
  }

  const rows = incoming.map((s, i) => ({ ...s, step_no: i + 1 }));
  return pdReplaceChildren({
    table: "pd_process_steps",
    parentColumn: "process_id",
    parentId: id,
    rows,
    editable: STEP_COLUMNS,
    request,
  });
}
