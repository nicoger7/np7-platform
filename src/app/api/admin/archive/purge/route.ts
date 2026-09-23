import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { ARCHIVE_BY_KEY } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// PERMANENT delete from the archive — the only true delete. Owner-only: the path
// /api/admin/archive/purge is in access.ts OWNER_ONLY, enforced by middleware.
export async function POST(req: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { entity, id } = await req.json().catch(() => ({}));
  const ent = ARCHIVE_BY_KEY[entity];
  if (!ent || !id) return NextResponse.json({ error: "Unknown entity or id." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Only ever purge something that's actually archived — never a live row.
  const { data: row } = await db.from(ent.table).select(ent.file ? `id, archived_at, ${ent.file.pathCol}` : "id, archived_at").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!row.archived_at) return NextResponse.json({ error: "Archive it first — only archived items can be permanently deleted." }, { status: 409 });

  const { error } = await db.from(ent.table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Its private file goes too, unless another row still points to the same one.
  const path = ent.file ? (row[ent.file.pathCol] as string | null) : null;
  if (ent.file && path) {
    const { count } = await db.from(ent.table).select("id", { count: "exact", head: true }).eq(ent.file.pathCol, path);
    if (count === 0) await db.storage.from(ent.file.bucket).remove([path]).then(() => {}, () => {});
  }
  return NextResponse.json({ ok: true });
}
