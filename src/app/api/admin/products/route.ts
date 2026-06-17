import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

// GET /api/admin/products — list products
export async function GET(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  let q = client.from("hw_products").select("*").order("name");
  if (search) q = q.ilike("name", `%${search}%`);
  if (category) q = q.eq("category", category);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/products — create a product
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const body = await request.json();

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const baseSlug = slugify(String(body.name));
  let slug = baseSlug;

  // Check for slug collision
  const { data: existing } = await client
    .from("hw_products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    slug = `${baseSlug}-${randomSuffix()}`;
  }

  const row = {
    name: String(body.name),
    slug,
    template: body.template ?? "board",
    category: body.category ?? "boards",
    status: body.status ?? "draft",
  };

  const { data, error } = await client
    .from("hw_products")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
