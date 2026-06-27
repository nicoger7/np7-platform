import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Auth helpers shared by the admin (team) and the member portal.
 *
 * Team membership is verified by matching the authenticated, verified session
 * email against the `team_members` table (service role) — robust regardless of
 * the auth_user_id linkage. Members are any other authenticated user, linked to
 * a `contacts` row.
 */

/** Admin "view as member" read-only preview cookie (set by the Member view tab). */
export const VIEW_AS_COOKIE = "np7_view_as";

export type TeamMember = { userId: string; email: string; teamMemberId: string; role: string | null };
export type PortalUser = { userId: string; email: string; contactId: string; name: string; preview?: boolean };

/**
 * Admin "view as member" preview — resolves the previewed contact, but ONLY for an
 * active team member with a `np7_view_as` cookie. Honoured on READ paths (page
 * renders + GET data) so the portal shows the member's view; every WRITE path
 * passes { allowPreview: false } so a mutation never runs as the previewed member.
 * Never links or writes anything (so it can't hijack the member's account).
 */
async function viewAsPreviewUser(realUserId: string): Promise<PortalUser | null> {
  const store = await cookies();
  const viewAs = store.get(VIEW_AS_COOKIE)?.value;
  if (!viewAs) return null;
  if (!(await getTeamMember())) return null; // only active team members may preview
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: c } = await admin.from("contacts").select("id, name, email").eq("id", viewAs).maybeSingle();
  if (!c) return null;
  return { userId: realUserId, email: c.email ?? "", contactId: c.id, name: c.name, preview: true };
}

export async function getTeamMember(): Promise<TeamMember | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_members")
    .select("id, role, active")
    .eq("email", user.email)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return { userId: user.id, email: user.email, teamMemberId: data.id, role: data.role ?? null };
}

export async function requireTeamApi():
  Promise<{ ok: true; member: TeamMember } | { ok: false; res: NextResponse }> {
  const member = await getTeamMember();
  if (!member) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  return { ok: true, member };
}

export async function getPortalUser(opts: { allowPreview?: boolean } = {}): Promise<PortalUser | null> {
  const { allowPreview = true } = opts;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Admin previewing a member's portal (read-only). Reads honour it; writes pass
  // allowPreview:false so a mutation never runs as the previewed member.
  if (allowPreview) {
    const preview = await viewAsPreviewUser(user.id).catch(() => null);
    if (preview) return preview;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let { data: contact } = await admin
    .from("contacts").select("id, name, email, auth_user_id")
    .eq("auth_user_id", user.id).maybeSingle();

  // first login after activation — link the contact by verified email
  if (!contact && user.email) {
    const r = await admin.from("contacts").select("id, name, email, auth_user_id").eq("email", user.email).maybeSingle();
    contact = r.data;
    if (contact && !contact.auth_user_id) {
      await admin.from("contacts").update({ auth_user_id: user.id }).eq("id", contact.id);
    }
  }
  if (!contact) return null;
  return { userId: user.id, email: user.email ?? contact.email ?? "", contactId: contact.id, name: contact.name };
}

export async function requirePortalApi():
  Promise<{ ok: true; user: PortalUser } | { ok: false; res: NextResponse }> {
  // Never impersonate on the shared API guard — writes act as the real user.
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, user };
}
