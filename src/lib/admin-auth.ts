import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { normalizeLevel, normalizeAccess, mergeAccess, type AccessLevel, type EffectiveAccess } from "@/lib/access";

/**
 * Resolve the active team member behind an auth user and their access level.
 * Matches by linked auth_user_id first, then falls back to email and self-heals
 * the link (so a member invited/added by email is recognised on first login).
 * Returns null for non-members or deactivated members. access_level tolerates
 * the column not yet existing (→ "owner", never lock out).
 */
export async function getActiveTeamMember(
  user: { id: string; email?: string | null }
): Promise<{ id: string; accessLevel: AccessLevel; roleIds: string[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  let { data } = await client.from("team_members").select("*").eq("auth_user_id", user.id).limit(1).maybeSingle();
  if (!data && user.email) {
    const byEmail = await client.from("team_members").select("*").ilike("email", user.email).limit(1).maybeSingle();
    data = byEmail.data;
    if (data && !data.auth_user_id) {
      await client.from("team_members").update({ auth_user_id: user.id }).eq("id", data.id);
    }
  }
  if (!data || data.active === false) return null;
  return { id: data.id as string, accessLevel: normalizeLevel(data.access_level), roleIds: Array.isArray(data.role_ids) ? data.role_ids : [] };
}

/**
 * Resolve a member's *effective* access. With no custom roles they keep the
 * owner/manager tier; one or more roles override it (merged — union of worlds,
 * most-permissive section level, any-grants-it for fields). Falls back to the
 * tier if the roles can't be loaded (never harden into a lockout by accident).
 */
export async function getEffectiveAccess(
  member: { accessLevel: AccessLevel; roleIds: string[] }
): Promise<EffectiveAccess> {
  if (!member.roleIds || member.roleIds.length === 0) return { kind: "tier", level: member.accessLevel };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data } = await client.from("team_roles").select("access").in("id", member.roleIds);
  const accesses = (data ?? []).map((r: { access: unknown }) => normalizeAccess(r.access));
  if (accesses.length === 0) return { kind: "tier", level: member.accessLevel };
  return { kind: "role", access: mergeAccess(accesses) };
}

/** The effective access for the current request's team member (or null). Use in
 *  API routes to redact sensitive fields the member's role can't see. */
export async function getRequestAccess(): Promise<EffectiveAccess | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const member = await getActiveTeamMember(user);
  if (!member) return null;
  return getEffectiveAccess(member);
}

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
