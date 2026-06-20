import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/products/:id/inquiries — list inquiries for a product, newest first
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;

  const { data, error } = await client
    .from("hw_inquiries")
    .select("*")
    .eq("product_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH /api/admin/products/:id/inquiries — update inquiry status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  await params;
  const body = await request.json();

  if (!body.inquiry_id) {
    return NextResponse.json({ error: "inquiry_id is required" }, { status: 400 });
  }

  const { data, error } = await client
    .from("hw_inquiries")
    .update({ status: body.status })
    .eq("id", body.inquiry_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
