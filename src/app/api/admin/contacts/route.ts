import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { missingArchivedCol } from "@/lib/archive";

// GET /api/admin/contacts — list all contacts
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search");
  const offset = (page - 1) * limit;

  // Sort params
  const sortParam = searchParams.get("sort") || "created_at";
  const orderParam = searchParams.get("order") || "desc";
  const allowedSortCols = ["name", "email", "country", "source", "level", "accepts_marketing", "created_at", "phone", "discipline", "tshirt_size", "date_of_birth"];
  const sortCol = allowedSortCols.includes(sortParam) ? sortParam : "created_at";
  const ascending = orderParam === "asc";

  // Hide archived rows at the DB level so pagination + count stay correct.
  // Tolerant: retry without the filter if migration 039 isn't applied yet.
  const buildQuery = (active: boolean) => {
    let q = client
      .from("contacts")
      .select("*", { count: "exact" })
      .order(sortCol, { ascending })
      .range(offset, offset + limit - 1);
    if (active) q = q.is("archived_at", null);
    if (search) {
      q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    return q;
  };

  let { data, error, count } = await buildQuery(true);
  if (error && missingArchivedCol(error.message)) ({ data, error, count } = await buildQuery(false));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count, page, limit });
}

// POST /api/admin/contacts — create a contact
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();

  const { data, error } = await client
    .from("contacts")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
