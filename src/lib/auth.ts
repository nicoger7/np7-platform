import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
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
export { VIEW_AS_COOKIE, PREVIEW_PARAM } from "@/lib/preview-const";
import { VIEW_AS_COOKIE, PREVIEW_PARAM } from "@/lib/preview-const";

export type TeamMember = { userId: string; email: string; teamMemberId: string; role: string | null };
export type PortalUser = { userId: string; email: string; contactId: string; name: string; preview?: boolean };

/**
 * Admin "view as member" preview — resolves the previewed contact, but ONLY for an
 * active team member with a `np7_view_as` cookie. Honoured on READ paths (page
 * renders + GET data) so the portal shows the member's view; every WRITE path
 * passes { allowPreview: false } so a mutation never runs as the previewed member.
 *
 * Scoped to the preview iframe: a TOP-LEVEL navigation (Sec-Fetch-Dest=document) —
 * i.e. the admin opening their OWN /account in a normal tab — is NOT honoured, so
 * the cookie can't bleed into their own browsing. The iframe (and in-iframe nav)
 * is never `document`, so it stays in preview. Never links/writes anything (so it
 * can't hijack the member's account).
 */
async function viewAsPreviewUser(realUserId: string): Promise<PortalUser | null> {
  const store = await cookies();
  const viewAs = store.get(VIEW_AS_COOKIE)?.value;
  if (!viewAs) return null;

  // The cookie is ambient — it rides along on EVERY request to the site, so on
  // its own it made the admin's ordinary browsing resolve as the previewed
  // member (and survived a logout, so the next login landed back in their
  // account). Requiring the preview marker fixes that: it is present only on
  // URLs the preview iframe itself loads, and on the Referer of fetches those
  // pages make. Normal browsing never carries it.
  const h = await headers();
  if (h.get("sec-fetch-dest") === "document") return null; // admin's own top-level tab
  const url = h.get("x-np7-pathname") ?? "";
  const referer = h.get("referer") ?? "";
  // The URL/Referer marker only survives ONE hop: portal links carry no query
  // string, so a fetch made from a page the preview navigated TO had an
  // unmarked Referer and silently answered as the admin — which is why a
  // previewed trip showed "No optional extras". The header is the same marker,
  // remembered client-side for the life of the iframe (see preview-client.ts).
  const marked =
    url.includes(PREVIEW_PARAM) ||
    referer.includes(PREVIEW_PARAM) ||
    h.get("x-np7-preview") === "1";
  if (!marked) return null;

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
    // Oldest match wins, case-insensitively. maybeSingle() ERRORS when two rows
    // share an address, and a duplicate is not the signed-in member's problem —
    // it locked them out of their own account entirely.
    const r0 = await admin.from("contacts").select("id, name, email, auth_user_id")
      .ilike("email", user.email).order("created_at", { ascending: true }).limit(1);
    const r = { data: r0.data?.[0] ?? null };
    contact = r.data;
    if (contact && !contact.auth_user_id) {
      await admin.from("contacts").update({ auth_user_id: user.id }).eq("id", contact.id);
    }
  }
  if (!contact) return null;
  return { userId: user.id, email: user.email ?? contact.email ?? "", contactId: contact.id, name: contact.name };
}

export async function requirePortalApi(opts: { allowPreview?: boolean } = {}):
  Promise<{ ok: true; user: PortalUser } | { ok: false; res: NextResponse }> {
  // Impersonation is OFF by default: a write must always act as the real user.
  //
  // READ handlers may opt in with { allowPreview: true }. Without it the admin's
  // "Member view" was only ever half-true — server-rendered content came from the
  // previewed member, but anything the portal fetched client-side ran as the
  // ADMIN, so it 404'd or came back empty. Add-ons were the visible symptom:
  // GET /api/portal/bookings/<id>/addons returned "Booking not found" because
  // ownedBooking() compared the booking to the admin's own contact id.
  //
  // The impersonation itself is already tightly scoped in viewAsPreviewUser():
  // it needs the admin-set cookie, an ACTIVE team member, and a non-`document`
  // fetch — so it cannot leak into the admin's own top-level browsing.
  const user = await getPortalUser({ allowPreview: opts.allowPreview === true });
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, user };
}


/**
 * May this request see the not-yet-public Experience world?
 *
 * Production hides /experience and /destinations behind SHOW_EXPERIENCE. Team
 * always passed (the admin preview button). Members now pass too — the soft
 * launch: customers who already have an account live in the full environment,
 * while anonymous visitors and crawlers keep getting a plain 404 until the
 * public reveal. The sitemap stays flag-only on purpose.
 */
export async function canSeeExperienceWorld(flagOn: boolean): Promise<boolean> {
  if (flagOn) return true;
  const team = await getTeamMember().catch(() => null);
  if (team) return true;
  const member = await getPortalUser().catch(() => null);
  return !!member?.contactId;
}
