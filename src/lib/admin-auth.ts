import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side mirror of the is_team_member() SQL helper (migration 009):
 * the user must have an active team_members row linked via auth_user_id.
 * Checking membership — not just authentication — matters because anyone
 * can self-register an auth user against the public Supabase endpoint.
 */
export async function isActiveTeamMember(userId: string): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("team_members")
    .select("id")
    .eq("auth_user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("team membership check failed", error.message);
    return false; // fail closed
  }
  return Boolean(data);
}

/**
 * Per-route guard for admin API handlers. Defense-in-depth on top of
 * middleware.ts (the primary gate): because admin routes talk to Supabase
 * through the service-role client — which bypasses RLS — a route that ever
 * slips the middleware matcher would otherwise be wide open.
 *
 * Returns a 401/403 NextResponse to return early, or null when the caller is
 * an active team member.
 */
export async function requireTeamMember(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isActiveTeamMember(user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
