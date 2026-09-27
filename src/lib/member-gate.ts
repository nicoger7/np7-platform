import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { flags } from "@/lib/flags";
import { canSeeExperienceWorld } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * Where a logged-out visitor goes when a world is member-visible but hidden.
 *
 * These worlds are NOT secret from members — a logged-in member sees them
 * today, before the public reveal. So a member who follows a link from an
 * email, or whose session has expired, was being told the page does not exist.
 * A 404 is the correct answer for something nobody may see; it is the wrong
 * answer for something THEY may see and simply are not signed in for.
 *
 * The login page says nothing about what is behind it, so this gives up very
 * little of the pre-launch quiet: a visitor learns the URL wants an account,
 * not what the account would show them. Worlds gated purely on a flag, with no
 * member exception at all (hardware, blog, spotguide), keep their plain 404 —
 * signing in would not help there, so offering it would be a lie.
 */
export async function redirectToMemberLogin(fallback: string): Promise<never> {
  // The middleware stamps the real path; the header carries the query too.
  const raw = (await headers()).get("x-np7-pathname") ?? "";
  const path = raw.split("?")[0] || fallback;
  // Only ever bounce to an in-app path — `next` is echoed into a link.
  const safe = /^\/(?!\/)/.test(path) ? path : fallback;
  redirect(`/account/login?next=${encodeURIComponent(safe)}`);
}

/**
 * May this request see this Experience page while the world is still hidden?
 *
 * WHY THIS LIVES HERE AND NOT ONLY IN THE LAYOUT (Nico, 27 Sep 2026).
 * The gate used to sit in app/experience/layout.tsx alone, and a layout is the
 * wrong place to stop a page. Next renders the layout, the page and
 * generateMetadata side by side, so by the time the layout redirected, the page
 * had already run its queries and rendered. The 307 to the login page carried
 * the whole trip in its body: Alaçatı's "from €1,800", every package price,
 * "Superior Room" eight times, and on /experience itself every trip card. A
 * browser follows the redirect and never shows it. A scraper reads all of it.
 * The hidden trips (Mauritius & Madagascar, the Race Clinic) leaked their title
 * and description the same way, through the metadata.
 *
 * So every page under /experience asks this FIRST, before any query, and the
 * layout keeps asking it too as the backstop for pages that do not. It is the
 * same trap app/destinations/[slug]/page.tsx documents and fixes, and the same
 * fix.
 *
 * Open when any of these holds:
 *  - the gift page. Buying a voucher is its own small shop and stays public.
 *  - canSeeExperienceWorld: the flag is on, or the viewer is team (the admin
 *    "Preview page" button and member view) or a signed-in member.
 *  - the experience is link-only (public_by_link, migration 155): Bonaire,
 *    and Alaçatı since 27 Sep 2026. Findable by its own link for an ad, a
 *    newsletter or a DM, and nowhere else.
 *
 * Takes a bare slug ("np7-alacati", what a page has from its params) or a path
 * ("/experience/np7-alacati", what the layout has from the middleware header).
 * Both end up asking the same cached question, so the layout, the page and the
 * metadata of one request pay for one answer between them, not three.
 */
export async function experienceGateOpen(slugOrPath: string): Promise<boolean> {
  const target = experienceGateTarget(slugOrPath);
  if (target.gift) return true;
  return gateOpenFor(target.slug ?? "");
}

/**
 * What a slug or path is about: the gift page, or an experience's slug (a
 * detail page or one of its per-edition pages). The slug is null for anything
 * else, /experience itself or an empty header, and null never opens by link.
 */
function experienceGateTarget(slugOrPath: string): { gift: boolean; slug: string | null } {
  const raw = (slugOrPath ?? "").split("?")[0].split("#")[0].trim();
  if (!raw) return { gift: false, slug: null };
  if (!raw.startsWith("/")) {
    // A bare slug from a page's params. One segment only, or it is not a slug.
    if (raw.includes("/")) return { gift: false, slug: null };
    return raw === "gift" ? { gift: true, slug: null } : { gift: false, slug: raw };
  }
  // Exactly the gift page and anything under it. A bare prefix match would
  // also have opened any future experience whose slug starts with "gift".
  if (raw === "/experience/gift" || raw.startsWith("/experience/gift/")) return { gift: true, slug: null };
  // The detail page, and, since an event series sells one clinic per URL, its
  // per-edition pages too. Without the second form, opening the Alaçatı link
  // 404'd at the layout before the route ever ran, which is a link-only
  // experience that cannot be opened by its own link.
  const m = /^\/experience\/([^/]+)(?:\/[^/]+)?$/.exec(raw);
  return { gift: false, slug: m ? m[1] : null };
}

/** One answer per slug per request (React cache is request-scoped on the
 *  server, and a plain pass-through anywhere else, tests included). */
const gateOpenFor = cache(async (slug: string): Promise<boolean> => {
  if (await canSeeExperienceWorld(flags.showExperience)) return true;
  return slug ? publicByLink(slug) : false;
});

/**
 * One experience opened by direct link while the world is still hidden
 * (migration 155). Detail pages only. /experience itself and every other slug
 * stay shut, and the row's own admin state still governs, so unticking the box
 * or unpublishing closes the door again. It never reaches an index or the
 * sitemap: those are gated by the same flag.
 */
async function publicByLink(slug: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("exp_experiences")
      .select("public_by_link,status,website_visible")
      .eq("slug", slug)
      .maybeSingle();
    return data?.public_by_link === true && data.status === "published" && data.website_visible !== false;
  } catch {
    return false; // pre-migration or transient → the gate stays shut
  }
}
