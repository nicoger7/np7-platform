import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/products/:id/variants — list variants for a product
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;

  const { data, error } = await client
    .from("hw_variants")
    .select("*")
    .eq("product_id", id)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(notArchived(data));
}

// POST /api/admin/products/:id/variants — create a variant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  if (!body.name || !body.sku) {
    return NextResponse.json({ error: "name and sku are required" }, { status: 400 });
  }

  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const { data, error } = await client
    .from("hw_variants")
    .insert({
      product_id: id,
      name: String(body.name),
      sku: String(body.sku).trim().toUpperCase(),
      ean: body.ean || null,
      attributes: body.attributes ?? {},
      weight_g: num(body.weight_g),
      box_l_mm: num(body.box_l_mm),
      box_w_mm: num(body.box_w_mm),
      box_h_mm: num(body.box_h_mm),
      hs_code: body.hs_code || null,
      customs_description: body.customs_description || null,
      country_of_origin: body.country_of_origin || null,
      preferential_origin: !!body.preferential_origin,
      customs_value: num(body.customs_value),
      serialized: !!body.serialized,
      rrp: num(body.rrp),
      lifecycle: body.lifecycle || "active",
      sort_order: num(body.sort_order) ?? 0,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
