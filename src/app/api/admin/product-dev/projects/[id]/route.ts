import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdPatch, pdDelete } from "@/lib/product-dev-api";
import { notArchived } from "@/lib/archive";

const CFG = PD_ENTITIES.projects;

/**
 * GET /api/admin/product-dev/projects/:id — the whole build sheet in one call.
 *
 * The detail page shows tooling, layups, plies, process and sources as tabs of
 * one document, and the entire dataset for a project is a few hundred rows, so
 * it ships as a single payload rather than five round trips on every tab click.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = pdDb();
  const { id } = await params;

  const { data: project, error } = await db.from("pd_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [constructions, molds, layups, processes, sources, materials, sizes] = await Promise.all([
    db.from("pd_constructions").select("*").eq("project_id", id).order("sort_order"),
    db.from("pd_molds").select("*").eq("project_id", id).order("kind").order("key_dimension_mm"),
    db.from("pd_layups").select("*").eq("project_id", id).order("name"),
    db.from("pd_processes").select("*").eq("project_id", id).order("stage_order"),
    db.from("pd_sources").select("*").eq("project_id", id).order("received_at", { ascending: false }),
    db.from("pd_materials").select("*").eq("active", true).order("name"),
    db.from("pd_project_sizes").select("*").eq("project_id", id).order("length_cm"),
  ]);

  const layupRows = notArchived(layups.data) as { id: string }[];
  const processRows = notArchived(processes.data) as { id: string }[];

  const [plies, steps] = await Promise.all([
    layupRows.length
      ? db.from("pd_layup_plies").select("*").in("layup_id", layupRows.map((l) => l.id)).order("ply_index")
      : Promise.resolve({ data: [] }),
    processRows.length
      ? db.from("pd_process_steps").select("*").in("process_id", processRows.map((p) => p.id)).order("step_no")
      : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    ...project,
    constructions: notArchived(constructions.data),
    molds: notArchived(molds.data),
    layups: layupRows,
    plies: plies.data ?? [],
    processes: processRows,
    steps: steps.data ?? [],
    sources: notArchived(sources.data),
    materials: materials.data ?? [],
    // Tolerant of migration 132 not being applied yet — no sizes, not an error.
    sizes: sizes.data ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return pdPatch(CFG, request, id);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return pdDelete(CFG, id);
}
