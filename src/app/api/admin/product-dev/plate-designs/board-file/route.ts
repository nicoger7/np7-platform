import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { requirePdEdit } from "@/lib/product-dev-api";
import { PLATE_BUCKET, boardFileStored, boardFilePath, parseBoardRef, plateDb } from "@/lib/plate-designs";

/**
 * POST /api/admin/product-dev/plate-designs/board-file — before a save, the
 * tool asks whether this board file (by its SHA-256) is already kept. If it
 * is, nothing is uploaded; if not, it gets a signed link to put the file
 * straight into the private bucket, without passing through this server.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const ref = parseBoardRef(await request.json().catch(() => null));
  if (typeof ref === "string") return NextResponse.json({ error: ref }, { status: 400 });

  const db = plateDb();
  const path = boardFilePath(ref.sha256, ref.kind);
  if (await boardFileStored(db, path)) return NextResponse.json({ exists: true });

  const { data, error } = await db.storage.from(PLATE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not prepare the upload." }, { status: 500 });
  return NextResponse.json({ exists: false, uploadUrl: data.signedUrl });
}
