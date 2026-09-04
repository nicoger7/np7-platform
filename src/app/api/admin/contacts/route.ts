import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { missingArchivedCol } from "@/lib/archive";
import { getRequestAccess, requireAdminGate } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
/** Null out a contact's personal data for roles without "contact_pii". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redactContactPii<T extends Record<string, any>>(c: T): T {
  return { ...c, email: null, phone: null, date_of_birth: null, diet_allergies: null, billing_address: null, billing_postal_code: null, billing_city: null, billing_country: null, pii_redacted: true };
}

// GET /api/admin/contacts — list all contacts
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search");
  // Segment: "crm" = working contacts (hides newsletter-only imports, i.e. the
  // 'maillist' tag), "newsletter" = only those, anything else/absent = all.
  const segment = searchParams.get("segment");
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
    // Segment filter (multiple .or() groups AND together, so this composes with search)
    if (segment === "crm") q = q.or("tags.is.null,tags.not.cs.{maillist}");
    else if (segment === "newsletter") q = q.contains("tags", ["maillist"]);
    return q;
  };

  let { data, error, count } = await buildQuery(true);
  if (error && missingArchivedCol(error.message)) ({ data, error, count } = await buildQuery(false));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const access = await getRequestAccess();
  // Redact unless the caller is proven allowed. `access &&` did the
  // opposite: an unidentified caller saw the unredacted rows.
  if (!access || !effectiveCanSeeField(access, "contact_pii")) {
    data = (data || []).map(redactContactPii);
  }

  return NextResponse.json({ data, count, page, limit });
}

// POST /api/admin/contacts — create a contact
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
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
