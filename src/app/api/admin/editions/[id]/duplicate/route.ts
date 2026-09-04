import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
const STRIP = new Set(["id", "created_at", "updated_at", "notion_id"]);
const rand = () => Math.random().toString(36).slice(2, 6);
function strip(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!STRIP.has(k)) out[k] = v;
  return out;
}

// POST /api/admin/editions/:id/duplicate
// Body: { target: 'existing' | 'new', experienceId? }
// Deep-copies the edition + its packages (+ package_components) + costs.
// Does NOT copy bookings / payments / rooms. 'new' spins up a fresh experience
// template (copy) to hold the duplicated edition; 'existing' attaches it to experienceId.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const target = body.target === "new" ? "new" : "existing";

  const { data: edition, error } = await db.from("exp_editions").select("*").eq("id", id).single();
  if (error || !edition) return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });

  // Resolve the experience this duplicate attaches to.
  let experienceId: string = edition.experience_id;
  if (target === "existing" && body.experienceId) {
    experienceId = body.experienceId;
  } else if (target === "new") {
    const { data: srcExp } = await db.from("exp_experiences").select("*").eq("id", edition.experience_id).single();
    if (srcExp) {
      const expCopy = strip(srcExp);
      expCopy.title = `${srcExp.title} (copy)`;
      expCopy.slug = `${srcExp.slug}-copy-${rand()}`;
      expCopy.status = "draft";
      const { data: newExp, error: e2 } = await db.from("exp_experiences").insert(expCopy).select("id").single();
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      experienceId = newExp.id;
    }
  }

  // Copy the edition.
  const edCopy = strip(edition);
  edCopy.experience_id = experienceId;
  if (typeof edCopy.label === "string") edCopy.label = `${edCopy.label} (copy)`;
  if (typeof edCopy.slug === "string") edCopy.slug = `${edition.slug}-copy-${rand()}`;
  edCopy.status = "draft";
  const { data: newEd, error: edErr } = await db.from("exp_editions").insert(edCopy).select("*").single();
  if (edErr) return NextResponse.json({ error: edErr.message }, { status: 400 });

  // Copy packages + their component links.
  const { data: pkgs } = await db.from("exp_packages").select("*").eq("edition_id", id);
  for (const pkg of pkgs ?? []) {
    const pkgCopy = strip(pkg);
    pkgCopy.edition_id = newEd.id;
    pkgCopy.experience_id = experienceId;
    if (typeof pkgCopy.slug === "string") pkgCopy.slug = `${pkg.slug}-copy-${rand()}`;
    const { data: newPkg } = await db.from("exp_packages").insert(pkgCopy).select("id").single();
    if (newPkg) {
      const { data: links } = await db.from("exp_package_components").select("*").eq("package_id", pkg.id);
      if (links?.length) {
        const rows = links.map((l: Record<string, unknown>) => ({ ...strip(l), package_id: newPkg.id }));
        await db.from("exp_package_components").insert(rows);
      }
    }
  }

  // Copy the cost structure (estimated/actual line items).
  const { data: costs } = await db.from("exp_costs").select("*").eq("edition_id", id);
  if (costs?.length) {
    const rows = costs.map((c: Record<string, unknown>) => ({ ...strip(c), edition_id: newEd.id, experience_id: experienceId }));
    await db.from("exp_costs").insert(rows);
  }

  return NextResponse.json(newEd, { status: 201 });
}
