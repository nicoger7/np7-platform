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

  // Keep the Supabase Auth LOGIN email in sync with the contact email. The portal
  // signs in against auth.users.email (password + magic link), NOT contacts.email
  // — so changing only the contact row silently breaks the member's login. Do the
  // auth update first: if it conflicts (address already used by another login),
  // fail the whole PATCH so the two can never drift apart.
  if (typeof body.email === "string") {
    const next = body.email.trim().toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cur } = await (client as any).from("contacts").select("email, auth_user_id").eq("id", id).maybeSingle();
    if (cur?.auth_user_id && next && next !== (cur.email ?? "").trim().toLowerCase()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: aErr } = await (client as any).auth.admin.updateUserById(cur.auth_user_id, { email: next, email_confirm: true });
      if (aErr) return NextResponse.json({ error: `Couldn't update the login email: ${aErr.message}` }, { status: 400 });
    }
    body.email = next; // store the normalized address so contact + login always match
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
