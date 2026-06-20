import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

function coerceNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

// GET /api/admin/products/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;

  const { data, error } = await client
    .from("hw_products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/admin/products/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // String fields
  for (const field of ["name", "slug", "subtitle", "category", "template", "currency", "sku", "status", "description"] as const) {
    if (field in body) update[field] = body[field];
  }

  // Numeric fields — coerce with Number(), empty string → null
  for (const field of ["price", "compare_at_price", "cost", "stock_count", "year"] as const) {
    if (field in body) update[field] = coerceNumeric(body[field]);
  }

  // Array/jsonb fields
  if ("images" in body) update.images = body.images;
  if ("specs" in body) update.specs = body.specs;

  const { data, error } = await client
    .from("hw_products")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/products/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;

  const { error } = await client.from("hw_products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
