import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { redactContactPii } from "../route";

// GET /api/admin/contacts/:id — get a single contact
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { data, error } = await client
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const access = await getRequestAccess();
  const out = access && !effectiveCanSeeField(access, "contact_pii") ? redactContactPii(data) : data;
  return NextResponse.json(out);
}

// PATCH /api/admin/contacts/:id — update a contact
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // Never let a PII-redacted view overwrite PII with blanked-out values, and
  // never persist the synthetic redaction flag.
  delete body.pii_redacted;
  const access = await getRequestAccess();
  if (access && !effectiveCanSeeField(access, "contact_pii")) {
    for (const f of ["email", "phone", "date_of_birth", "diet_allergies", "billing_address", "billing_postal_code", "billing_city", "billing_country"]) {
      delete body[f];
    }
  }

  const { data, error } = await client
    .from("contacts")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/contacts/:id — delete a contact
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { ok, error } = await softDelete(client, "contacts", id);

  if (!ok) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
