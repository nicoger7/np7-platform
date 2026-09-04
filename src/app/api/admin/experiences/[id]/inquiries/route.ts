import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { isActiveTeamMember, requireAdminGate } from "@/lib/admin-auth";
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
  return user;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = getServiceClient();

  const { data, error } = await admin
    .from("exp_inquiries")
    .select("*")
    .eq("experience_id", id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ inquiries: data });
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inquiryId, status } = await request.json();
  const admin = getServiceClient();

  const { data, error } = await admin
    .from("exp_inquiries")
    .update({ status })
    .eq("id", inquiryId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ inquiry: data });
}
