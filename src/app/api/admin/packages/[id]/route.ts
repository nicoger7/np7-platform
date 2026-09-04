import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { revalidateExperienceById } from "@/lib/revalidate-public";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/packages/:id — get package with its components
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;

  const [pkg, components] = await Promise.all([
    client
      .from("exp_packages")
      .select("*, exp_experiences(id, title)")
      .eq("id", id)
      .single(),
    client
      .from("exp_package_components")
      .select("*, exp_components(id, name, category, unit_cost)")
      .eq("package_id", id),
  ]);

  if (pkg.error) {
    return NextResponse.json({ error: pkg.error.message }, { status: 404 });
  }

  return NextResponse.json({
    ...pkg.data,
    components: components.data || [],
  });
}

// PATCH /api/admin/packages/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  // hotel_id (023) / website_visible (044) may not exist yet — strip & retry if rejected.
  const PENDING_OPTIONAL = ["hotel_id", "website_visible"];
  const doUpdate = (payload: Record<string, unknown>) =>
    client.from("exp_packages").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id).select().single();

  let { data, error } = await doUpdate(body);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    const stripped = Object.fromEntries(Object.entries(body).filter(([k]) => !PENDING_OPTIONAL.includes(k)));
    ({ data, error } = await doUpdate(stripped));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await revalidateExperienceById(client, data?.experience_id);
  return NextResponse.json(data);
}

// DELETE /api/admin/packages/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;

  const { ok, error } = await softDelete(client, "exp_packages", id);

  if (!ok) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
