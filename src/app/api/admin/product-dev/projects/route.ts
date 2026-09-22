import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdCreate } from "@/lib/product-dev-api";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
const CFG = PD_ENTITIES.projects;

type LayupRow = { id: string; project_id: string; name: string; is_reference: boolean; archived_at: string | null };

// GET /api/admin/product-dev/projects — list with mold / build-sheet / stage
// counts, plus the ply lengths of each project's reference sheet so the card
// can draw the fin from its own stack.
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
  const counts = new Map<string, { molds: number; layups: number; stages: number }>();
  const bump = (id: string, k: "molds" | "layups" | "stages") => {
    const c = counts.get(id) ?? { molds: 0, layups: 0, stages: 0 };
    c[k]++; counts.set(id, c);
  };
  const thumbs = new Map<string, { l: number; c: string | null }[]>();

  if (ids.length) {
    const [{ data: molds }, { data: layups }, { data: stages }] = await Promise.all([
      db.from("pd_molds").select("project_id,archived_at").in("project_id", ids),
      db.from("pd_layups").select("id,project_id,name,is_reference,archived_at").in("project_id", ids),
      db.from("pd_processes").select("project_id,archived_at").in("project_id", ids),
    ]);
    for (const m of (molds ?? []) as { project_id: string; archived_at: string | null }[]) if (!m.archived_at) bump(m.project_id, "molds");
    for (const s of (stages ?? []) as { project_id: string; archived_at: string | null }[]) if (!s.archived_at) bump(s.project_id, "stages");

    const live = ((layups ?? []) as LayupRow[]).filter((l) => !l.archived_at);
    for (const l of live) bump(l.project_id, "layups");

    // One sheet per project: the quoting reference, else the first by name.
    const pick = new Map<string, LayupRow>();
    for (const l of [...live].sort((a, b) => Number(b.is_reference) - Number(a.is_reference) || a.name.localeCompare(b.name))) {
      if (!pick.has(l.project_id)) pick.set(l.project_id, l);
    }
    const refIds = [...pick.values()].map((l) => l.id);
    if (refIds.length) {
      const { data: plies } = await db.from("pd_layup_plies").select("layup_id,ply_index,length_cm,material_id").in("layup_id", refIds);
      const rows = (plies ?? []) as { layup_id: string; ply_index: number; length_cm: number | null; material_id: string }[];
      const matIds = [...new Set(rows.map((r) => r.material_id))];
      const { data: mats } = matIds.length
        ? await db.from("pd_materials").select("id,diagram_color").in("id", matIds)
        : { data: [] };
      const colour = new Map(((mats ?? []) as { id: string; diagram_color: string | null }[]).map((m) => [m.id, m.diagram_color]));
      const projectOf = new Map([...pick.values()].map((l) => [l.id, l.project_id]));
      for (const r of rows.sort((a, b) => a.ply_index - b.ply_index)) {
        const pid = projectOf.get(r.layup_id);
        if (!pid) continue;
        const arr = thumbs.get(pid) ?? [];
        arr.push({ l: Number(r.length_cm) || 0, c: colour.get(r.material_id) ?? null });
        thumbs.set(pid, arr);
      }
    }
  }

  return NextResponse.json(projects.map((p) => ({
    ...p,
    ...(counts.get(p.id) ?? { molds: 0, layups: 0, stages: 0 }),
    thumb: thumbs.get(p.id) ?? [],
  })));
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return pdCreate(CFG, request);
}
