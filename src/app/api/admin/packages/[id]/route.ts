import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/packages/:id — get package with its components
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const [pkg, components] = await Promise.all([
    client
      .from("exp_packages")
      .select("*, exp_experiences(id, title)")
      .eq("id", id)
      .single(),
    client
      .from("exp_package_components")
      .select("*, exp_components(id, name, category, unit_cost)")
      .eq("package_id", id),
  ]);

  if (pkg.error) {
    return NextResponse.json({ error: pkg.error.message }, { status: 404 });
  }

  return NextResponse.json({
    ...pkg.data,
    components: components.data || [],
  });
}

// PATCH /api/admin/packages/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_packages")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/packages/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { error } = await client.from("exp_packages").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
