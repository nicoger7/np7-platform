import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/admin/packages/:id/duplicate — copy a package + its component links.
// Optional JSON body { editionId }: retarget the copy to another edition (used by
// "duplicate set → year"). Retargeted copies keep the original name (same package,
// different week/year); same-edition copies get "(copy)" so they don't collide.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json().catch(() => ({} as { editionId?: string }));
  const targetEditionId = typeof body?.editionId === "string" && body.editionId ? body.editionId : null;

  const { data: original, error: origErr } = await client
    .from("exp_packages")
    .select("*")
    .eq("id", id)
    .single();
  if (origErr || !original) {
    return NextResponse.json({ error: origErr?.message || "Not found" }, { status: 404 });
  }

  // Copy all fields except identity/audit; never reuse slug/notion_id
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const { id: _id, created_at, updated_at, notion_id, slug, ...rest } = original as any;
  // generated DB types are stale (no edition_id) — read it loosely
  const retarget = targetEditionId && targetEditionId !== (original as Record<string, unknown>).edition_id;
  const copyName = retarget ? original.name : `${original.name} (copy)`;
  // slug is NOT NULL — derive a fresh unique one from the copy's name
  const copySlug = `${copyName.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`;
  const insertCopy = (status: string) =>
    client
      .from("exp_packages")
      .insert({
        ...rest,
        name: copyName,
        slug: copySlug,
        status, // copies never arrive live — review prices before activating
        ...(retarget ? { edition_id: targetEditionId } : {}),
      })
      .select()
      .single();
  // 'draft' needs migration 073 (widened status CHECK); until it's applied,
  // fall back to 'archived' — the other allowed non-live status.
  let { data: copy, error: copyErr } = await insertCopy("draft");
  if (copyErr && /status_check/.test(copyErr.message)) ({ data: copy, error: copyErr } = await insertCopy("archived"));
  if (copyErr || !copy) return NextResponse.json({ error: copyErr?.message ?? "Copy failed" }, { status: 400 });

  // Copy component links
  const { data: links } = await client
    .from("exp_package_components")
    .select("component_id, quantity, notes")
    .eq("package_id", id);
  if (links && links.length) {
    await client
      .from("exp_package_components")
      .insert(links.map((l) => ({ ...l, package_id: copy.id })));
  }

  return NextResponse.json(copy, { status: 201 });
}
