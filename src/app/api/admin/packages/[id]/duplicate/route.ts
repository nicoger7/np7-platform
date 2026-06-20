import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/admin/packages/:id/duplicate — copy a package + its component links
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { data: original, error: origErr } = await client
    .from("exp_packages")
    .select("*")
    .eq("id", id)
    .single();
  if (origErr || !original) {
    return NextResponse.json({ error: origErr?.message || "Not found" }, { status: 404 });
  }

  // Copy all fields except identity/audit; suffix the name, never reuse slug/notion_id
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const { id: _id, created_at, updated_at, notion_id, slug, ...rest } = original as any;
  const copyName = `${original.name} (copy)`;
  const { data: copy, error: copyErr } = await client
    .from("exp_packages")
    .insert({ ...rest, name: copyName, slug: null, status: "draft" })
    .select()
    .single();
  if (copyErr) return NextResponse.json({ error: copyErr.message }, { status: 400 });

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
