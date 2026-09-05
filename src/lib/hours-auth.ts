import { createAdminClient } from "@/lib/supabase";
import { getRequestMember } from "@/lib/admin-auth";

/**
 * Who is logging hours, and may they touch OTHER people's hours?
 *
 * Rule: owners/managers (the built-in tier, or an Owner/Manager system role) can
 * manage everyone's hours; every other member can only ever log/see/edit their
 * OWN. This is what makes hours auto-attach to the signed-in user — a member can
 * never select someone else.
 */
export type HoursActor = { id: string; name: string; canManageOthers: boolean };

export async function getHoursActor(): Promise<HoursActor | null> {
  // The middleware already resolved and signed this caller; no second lookup.
  const member = await getRequestMember();
  if (!member) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: row } = await admin.from("team_members").select("name").eq("id", member.id).maybeSingle();

  // No custom roles → owner/manager tier (full). With custom roles, only an
  // Owner/Manager *system* role grants managing others; custom staff roles don't.
  let canManageOthers = !member.roleIds || member.roleIds.length === 0;
  if (!canManageOthers && member.roleIds.length) {
    const { data: roles } = await admin.from("team_roles").select("system_key").in("id", member.roleIds);
    canManageOthers = (roles ?? []).some(
      (r: { system_key?: string | null }) => r.system_key === "owner" || r.system_key === "manager"
    );
  }
  return { id: member.id, name: row?.name ?? "", canManageOthers };
}
