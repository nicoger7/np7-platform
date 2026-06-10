import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/packages — list packages (optionally filtered by experience)
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");
  const editionId = searchParams.get("edition_id");

  let query = client
    .from("exp_packages")
    .select("*, exp_experiences(title)")
    .order("sort_order");

  if (experienceId) {
    query = query.eq("experience_id", experienceId);
  }
  if (editionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).eq("edition_id", editionId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Computed fields per package:
  //   component_count = links in the junction
  //   cost_estimate   = cost_per_person if set, else Σ(component buy × qty)
  //   margin          = price − cost_estimate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkgs = (data || []) as any[];
  const pkgIds = pkgs.map((p) => p.id);
  const linkCount: Record<string, number> = {};
  const compCostByPkg: Record<string, number> = {};

  if (pkgIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: links } = await (client as any)
      .from("exp_package_components")
      .select("package_id, component_id, quantity")
      .in("package_id", pkgIds);
    const compIds = Array.from(new Set((links || []).map((l: { component_id: string }) => l.component_id))) as string[];
    const costById: Record<string, number> = {};
    if (compIds.length) {
      const { data: comps } = await client
        .from("exp_components")
        .select("id, unit_cost")
        .in("id", compIds);
      for (const c of comps || []) costById[c.id] = Number(c.unit_cost) || 0;
    }
    for (const l of (links || []) as { package_id: string; component_id: string; quantity: number | null }[]) {
      linkCount[l.package_id] = (linkCount[l.package_id] || 0) + 1;
      compCostByPkg[l.package_id] = (compCostByPkg[l.package_id] || 0) + (costById[l.component_id] || 0) * (Number(l.quantity) || 1);
    }
  }

  const enriched = pkgs.map((p) => {
    const cost = p.cost_per_person != null ? Number(p.cost_per_person) : (compCostByPkg[p.id] ?? null);
    const margin = p.price != null && cost != null ? Number(p.price) - cost : null;
    return {
      ...p,
      component_count: linkCount[p.id] || 0,
      cost_estimate: cost,
      margin,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/admin/packages — create a package
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();

  const { data, error } = await client
    .from("exp_packages")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
