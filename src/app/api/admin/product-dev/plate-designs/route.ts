import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { requirePdEdit } from "@/lib/product-dev-api";
import { PLATE_LIST_COLUMNS, boardFileStored, parseSave, plateDb, saverName } from "@/lib/plate-designs";

/**
 * GET  /api/admin/product-dev/plate-designs — the Plate Designer's projects,
 *      last saved first. Without the designs themselves: those come with open.
 * POST /api/admin/product-dev/plate-designs — a new project.
 *
 * The tool calls these itself (it runs on this origin), so the projects work
 * the same inside the admin page and in the full window.
 */
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { data, error } = await plateDb()
    .from("pd_plate_designs")
    .select(PLATE_LIST_COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const values = parseSave(body as Record<string, unknown>, true);
  if (typeof values === "string") return NextResponse.json({ error: values }, { status: 400 });

  const db = plateDb();
  if (values.board_file_path && !(await boardFileStored(db, values.board_file_path as string))) {
    return NextResponse.json({ error: "The board file did not finish uploading. Save again." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("pd_plate_designs")
    .insert({ ...values, updated_by: await saverName(db), created_at: now, updated_at: now })
    .select(PLATE_LIST_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
