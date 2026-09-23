import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { requirePdEdit } from "@/lib/product-dev-api";
import { softDelete } from "@/lib/archive";
import { PLATE_BUCKET, PLATE_LIST_COLUMNS, boardFileStored, isUuid, parseSave, plateDb, saverName } from "@/lib/plate-designs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET    — one project: the design, the board setup, and a ten-minute link to
 *          its board file so the tool can load the board straight back.
 * PATCH  — save. With `base_updated_at` (when the tool last opened or saved it)
 *          the save only lands if nobody else saved in between; otherwise 409
 *          says who did, and the tool asks before overwriting.
 * DELETE — archive (restorable from the Archive page).
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const db = plateDb();
  const { data: row, error } = await db.from("pd_plate_designs").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "That project was deleted or never existed." }, { status: 404 });

  let board_url: string | null = null;
  if (row.board_file_path) {
    const { data } = await db.storage.from(PLATE_BUCKET).createSignedUrl(row.board_file_path, 600);
    board_url = data?.signedUrl ?? null;
  }
  return NextResponse.json({ ...row, board_url });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const values = parseSave(body as Record<string, unknown>, false);
  if (typeof values === "string") return NextResponse.json({ error: values }, { status: 400 });

  const db = plateDb();
  if (values.board_file_path && !(await boardFileStored(db, values.board_file_path as string))) {
    return NextResponse.json({ error: "The board file did not finish uploading. Save again." }, { status: 409 });
  }

  let q = db
    .from("pd_plate_designs")
    .update({ ...values, updated_by: await saverName(db), updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  const base = (body as { base_updated_at?: unknown }).base_updated_at;
  if (typeof base === "string" && base) q = q.eq("updated_at", base);
  const { data, error } = await q.select(PLATE_LIST_COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data) return NextResponse.json(data);

  // Nothing matched: deleted meanwhile, or somebody saved after we opened it.
  const { data: now } = await db.from("pd_plate_designs").select("updated_at,updated_by,archived_at").eq("id", id).maybeSingle();
  if (!now || now.archived_at) return NextResponse.json({ error: "That project was deleted meanwhile. Save it as a new one." }, { status: 404 });
  return NextResponse.json({ conflict: true, updated_at: now.updated_at, updated_by: now.updated_by }, { status: 409 });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "No such project." }, { status: 404 });
  const r = await softDelete(plateDb(), "pd_plate_designs", id);
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Could not delete." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
