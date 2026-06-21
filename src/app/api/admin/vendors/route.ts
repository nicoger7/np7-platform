import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";

export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let query = client
    .from("vendors")
    .select("*")
    .order("name");

  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(notArchived(data));
}

export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  const { data, error } = await client.from("vendors").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
