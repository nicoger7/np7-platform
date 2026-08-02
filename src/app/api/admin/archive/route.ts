import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { ARCHIVE_ENTITIES, ARCHIVE_BY_KEY, missingArchivedCol } from "@/lib/archive";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanAccessSection } from "@/lib/access";

// Auth: middleware gates /api/admin. Archive + restore are allowed for any team
// member; permanent delete lives at /api/admin/archive/purge (owner-only path).
//
// But the LIST is per-entity gated. Middleware can't help here: /admin/archive
// is deliberately section-less, so it fails open, while the rows it renders come
// from every world. An entity carrying `section` is only listed for members who
// can reach that section — otherwise a role scoped to Experience reads factory,
// supplier and R&D names straight off the archive page.

// ─── GET — everything currently archived, grouped by entity ─────────────────────
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const access = await getRequestAccess();
  const visible = ARCHIVE_ENTITIES.filter(
    (e) => !e.section || (access ? effectiveCanAccessSection(access, e.section) : false)
  );

  const groups = await Promise.all(
    visible.map(async (e) => {
      const cols = ["id", e.titleCol, ...(e.subtitleCols ?? []), "archived_at"].join(", ");
      const { data, error } = await db
        .from(e.table)
        .select(cols)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      // Pre-migration (column missing) or any error → just no archived rows here.
      if (error || !data) return { key: e.key, label: e.plural, items: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (data as any[]).map((r) => ({
        id: r.id,
        title: r[e.titleCol] ?? "—",
        subtitle: (e.subtitleCols ?? []).map((c) => r[c]).filter(Boolean).join(" · "),
        archivedAt: r.archived_at,
        href: e.href ? e.href(r.id) : null,
      }));
      return { key: e.key, label: e.plural, items };
    })
  );

  return NextResponse.json({ groups: groups.filter((g) => g.items.length > 0), total: groups.reduce((s, g) => s + g.items.length, 0) });
}

// ─── POST — archive or restore one row ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { entity, id, action } = await req.json().catch(() => ({}));
  const ent = ARCHIVE_BY_KEY[entity];
  if (!ent || !id) return NextResponse.json({ error: "Unknown entity or id." }, { status: 400 });
  if (action !== "archive" && action !== "restore") return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  // Same gate as the list: without it a member who can't see a section could
  // still archive or restore its rows by posting the entity key directly.
  if (ent.section) {
    const access = await getRequestAccess();
    if (!access || !effectiveCanAccessSection(access, ent.section)) {
      return NextResponse.json({ error: "Not available for your role." }, { status: 403 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const archived_at = action === "archive" ? new Date().toISOString() : null;
  const { error } = await db.from(ent.table).update({ archived_at }).eq("id", id);
  if (error) {
    if (missingArchivedCol(error.message)) {
      return NextResponse.json({ error: "Apply migration 039 to enable the archive." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
