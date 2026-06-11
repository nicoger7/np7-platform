import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// PUT — a member updates their own profile (additional info + marketing consent).
export async function PUT(request: NextRequest) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);

  // only self-editable fields
  const update: Record<string, unknown> = {};
  if (str(body.name) !== undefined) update.name = str(body.name);
  if (str(body.phone) !== undefined) update.phone = str(body.phone);
  if (str(body.country) !== undefined) update.country = str(body.country);
  if (str(body.tshirt_size) !== undefined) update.tshirt_size = str(body.tshirt_size);
  if (str(body.diet_allergies) !== undefined) update.diet_allergies = str(body.diet_allergies);
  if (str(body.date_of_birth) !== undefined) update.date_of_birth = str(body.date_of_birth) || null;
  if (typeof body.marketing_opt_in === "boolean") {
    update.marketing_opt_in = body.marketing_opt_in;
    update.marketing_opt_in_at = body.marketing_opt_in ? new Date().toISOString() : null;
  }
  update.updated_at = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("contacts").update(update).eq("id", auth.user.contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
