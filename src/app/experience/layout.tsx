import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BotIdClient } from "botid/client";
import { flags } from "@/lib/flags";
import { getTeamMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// Hidden in production until SHOW_EXPERIENCE=true — a plain 404, no public hint.
// Exceptions: the gift-voucher purchase page stays open (standalone commerce
// flow), and logged-in TEAM members always get through — that's the admin
// "Preview page" button working in production before the reveal. (The team
// check only runs when the flag is off, so it can't affect rendering later.)
export default async function ExperienceLayout({ children }: { children: React.ReactNode }) {
  // the header carries path + query — strip the query before matching
  const path = ((await headers()).get("x-np7-pathname") ?? "").split("?")[0];
  const isGift = path.startsWith("/experience/gift");
  if (!flags.showExperience && !isGift && !(await publicByLink(path))) {
    const team = await getTeamMember().catch(() => null);
    if (!team) notFound();
  }
  return (
    <>
      {/* Invisible Vercel BotID — protects the free registration endpoint. */}
      <BotIdClient protect={[{ path: "/api/register", method: "POST" }]} />
      {children}
    </>
  );
}

/**
 * One experience opened by direct link while the world is still hidden
 * (migration 155). Detail pages only — /experience itself and every other slug
 * keep 404ing — and the row's own admin state still governs, so unticking the
 * box or unpublishing closes the door again. It never reaches an index or the
 * sitemap: those are gated by the same flag.
 */
async function publicByLink(path: string): Promise<boolean> {
  // The detail page, and — since an event series sells one clinic per URL —
  // its per-edition pages too. Without the second form, opening the Alaçatı
  // link 404'd at the layout before the route ever ran, which is a link-only
  // experience that cannot be opened by its own link.
  const m = /^\/experience\/([^/]+)(?:\/[^/]+)?$/.exec(path);
  if (!m) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("exp_experiences")
      .select("public_by_link,status,website_visible")
      .eq("slug", m[1])
      .maybeSingle();
    return data?.public_by_link === true && data.status === "published" && data.website_visible !== false;
  } catch {
    return false; // pre-migration or transient → the gate stays shut
  }
}
