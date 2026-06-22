import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeamMember, getEffectiveAccess } from "@/lib/admin-auth";

// GET /api/admin/me — the current team member's effective access, for client
// components that redact sensitive fields (prices, costs, contact PII).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await getActiveTeamMember(user);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await getEffectiveAccess(member);
  return NextResponse.json({ access });
}
