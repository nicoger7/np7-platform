import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdCreate } from "@/lib/product-dev-api";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
const CFG = PD_ENTITIES.projects;

// GET /api/admin/product-dev/projects — list with mold / build-sheet counts.
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const db = pdDb();
  const search = request.nextUrl.searchParams.get("search");

  let q = db.from("pd_projects").select("*").order("name");
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projects = notArchived(data) as { id: string }[];
  const ids = projects.map((p) => p.id);
  const counts = new Map<string, { molds: number; layups: number }>();

  if (ids.length) {
    const [{ data: molds }, { data: layups }] = await Promise.all([
      db.from("pd_molds").select("project_id,archived_at").in("project_id", ids),
      db.from("pd_layups").select("project_id,archived_at").in("project_id", ids),
    ]);
    for (const m of (molds ?? []) as { project_id: string; archived_at: string | null }[]) {
      if (m.archived_at) continue;
      const c = counts.get(m.project_id) ?? { molds: 0, layups: 0 };
      c.molds++; counts.set(m.project_id, c);
    }
    for (const l of (layups ?? []) as { project_id: string; archived_at: string | null }[]) {
      if (l.archived_at) continue;
      const c = counts.get(l.project_id) ?? { molds: 0, layups: 0 };
      c.layups++; counts.set(l.project_id, c);
    }
  }

  return NextResponse.json(projects.map((p) => ({ ...p, ...(counts.get(p.id) ?? { molds: 0, layups: 0 }) })));
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return pdCreate(CFG, request);
}
