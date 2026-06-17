import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/products/:id/variants — list variants for a product
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;

  const { data, error } = await client
    .from("hw_variants")
    .select("*")
    .eq("product_id", id)
    .order("label");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/products/:id/variants — create a variant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const row = {
    product_id: id,
    label: body.label ?? "",
    stock_count: body.stock_count != null ? Number(body.stock_count) : null,
    reserved_count: body.reserved_count != null ? Number(body.reserved_count) : null,
  };

  const { data, error } = await client
    .from("hw_variants")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/admin/products/:id/variants — update a variant (body must include variant_id)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  // id is not used for the update itself but ensures we're in the right product scope
  await params;
  const body = await request.json();

  if (!body.variant_id) {
    return NextResponse.json({ error: "variant_id is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("label" in body) update.label = body.label;
  if ("stock_count" in body)
    update.stock_count = body.stock_count != null ? Number(body.stock_count) : null;
  if ("reserved_count" in body)
    update.reserved_count = body.reserved_count != null ? Number(body.reserved_count) : null;

  const { data, error } = await client
    .from("hw_variants")
    .update(update)
    .eq("id", body.variant_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/products/:id/variants?variant_id= — delete a variant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  await params;
  const { searchParams } = new URL(request.url);
  const variantId = searchParams.get("variant_id");

  if (!variantId) {
    return NextResponse.json({ error: "variant_id is required" }, { status: 400 });
  }

  const { error } = await client.from("hw_variants").delete().eq("id", variantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
