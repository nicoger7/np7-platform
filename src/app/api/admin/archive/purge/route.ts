import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { ARCHIVE_BY_KEY } from "@/lib/archive";

// PERMANENT delete from the archive — the only true delete. Owner-only: the path
// /api/admin/archive/purge is in access.ts OWNER_ONLY, enforced by middleware.
export async function POST(req: NextRequest) {
  const { entity, id } = await req.json().catch(() => ({}));
  const ent = ARCHIVE_BY_KEY[entity];
  if (!ent || !id) return NextResponse.json({ error: "Unknown entity or id." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Only ever purge something that's actually archived — never a live row.
  const { data: row } = await db.from(ent.table).select("id, archived_at").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!row.archived_at) return NextResponse.json({ error: "Archive it first — only archived items can be permanently deleted." }, { status: 409 });

  const { error } = await db.from(ent.table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
