import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/packages/:id/components — list components in a package
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { data, error } = await client
    .from("exp_package_components")
    .select("*, exp_components(id, name, category, unit_cost, sell_price, description)")
    .eq("package_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/packages/:id/components — add a component to a package
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_package_components")
    .insert({
      package_id: id,
      component_id: body.component_id,
      quantity: body.quantity || 1,
      notes: body.notes || null,
    })
    .select("*, exp_components(id, name, category, unit_cost, sell_price)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/admin/packages/:id/components — update a link's quantity/notes
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();
  if (!body.component_id) {
    return NextResponse.json({ error: "component_id is required" }, { status: 400 });
  }
  const { data, error } = await client
    .from("exp_package_components")
    .update({ quantity: body.quantity ?? 1, notes: body.notes ?? null })
    .eq("package_id", id)
    .eq("component_id", body.component_id)
    .select("*, exp_components(id, name, category, unit_cost, sell_price)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/packages/:id/components — remove a component from a package
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const componentId = searchParams.get("component_id");

  if (!componentId) {
    return NextResponse.json(
      { error: "component_id is required" },
      { status: 400 }
    );
  }

  const { error } = await client
    .from("exp_package_components")
    .delete()
    .eq("package_id", id)
    .eq("component_id", componentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
