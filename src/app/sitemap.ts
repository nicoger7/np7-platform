import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { flags } from "@/lib/flags";
import { getEventRuns } from "@/lib/events";

const SITE = "https://www.np-seven.com";

// Without this the sitemap is baked at build time, so a new post or destination
// never reaches Google until the next deploy. An hour, matching the pages it
// lists; admin writes also invalidate it (src/lib/revalidate-public.ts).
export const revalidate = 3600;

/**
 * DB-driven sitemap: magazine (index + tab routes + every published post) and
 * the spotguide (index + every destination). Experience surfaces join
 * automatically the day SHOW_EXPERIENCE goes live, no code change needed.
 *
 * The one rule every block below follows: a URL goes in only when the page
 * itself would answer it with a 200. Each block asks the SAME question its page
 * asks before rendering (the same flag, the same column), because a sitemap
 * that disagrees with its pages sends Google to 404s and redirects while
 * leaving live pages out. That is exactly what it was doing before
 * (site audit, 27 Sep 2026): /spotguide/volosko listed and 404ing, 15 live areas
 * missing, two old magazine posts listed that only redirect.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    // The legal pages. All four are set to index and are always public, so all
    // four are listed. Impressum and Widerrufsbelehrung were missing.
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/impressum`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/widerrufsbelehrung`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];

  /* Magazine + spotguide. Both layouts 404 when SHOW_BLOG is off
   * (src/app/blog/layout.tsx, src/app/spotguide/layout.tsx), so the whole
   * block rides on the same flag, the way /about and /experience already do
   * below. Without it, switching the flag off would leave about 30 dead URLs
   * in Google's queue. */
  if (flags.showBlog) {
    entries.push(
      { url: `${SITE}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
      // /blog/spotguide now 308s to /spotguide (the product); don't list the redirect.
      { url: `${SITE}/blog/gear`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE}/blog/technique`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
      { url: `${SITE}/spotguide`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    );

    // magazine posts
    const { data: posts } = await supabase
      .from("exp_blog_posts")
      .select("slug,published_at,updated_at,template")
      .eq("status", "published");
    for (const p of (posts ?? []) as { slug: string | null; published_at: string | null; updated_at: string | null; template: string | null }[]) {
      if (!p.slug) continue;
      /* A post on the legacy `spotguide` template is not a page any more: it
       * redirects to its /spotguide destination (src/app/blog/[slug]/page.tsx).
       * Listing it hands Google a redirect to follow instead of the page.
       * Filtered here in JS, not with .neq("template", "spotguide"), because
       * .neq in PostgREST also drops every row whose template is NULL, and
       * that is most of the magazine. Members-only posts stay listed on
       * purpose: the page serves them (a teaser and a sign-in wall) with no
       * noindex; generateStaticParams skips them for caching reasons only. */
      if (p.template === "spotguide") continue;
      entries.push({
        url: `${SITE}/blog/${p.slug}`,
        lastModified: new Date(p.updated_at ?? p.published_at ?? now),
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }

    /* Spotguide destinations. The page 404s unless spotguide_status is
     * 'published' (getDestinationVisibility in src/lib/spotguide-data.ts), so
     * that is the column asked here, the same filter as
     * getPublishedDestinationSlugs(). It used to read `status`, which is the
     * EXPERIENCE world's column on the same row and says nothing about the
     * spotguide. Spot sub-pages (/spotguide/x/y) stay out on purpose: their
     * canonical points at the destination. */
    // `destinations` postdates the generated DB types; repo convention is to cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dests } = await (supabase as any)
      .from("destinations")
      .select("slug,updated_at")
      .eq("spotguide_status", "published")
      .not("slug", "is", null);
    for (const d of (dests ?? []) as { slug: string | null; updated_at: string | null }[]) {
      if (!d.slug) continue;
      entries.push({
        url: `${SITE}/spotguide/${d.slug}`,
        lastModified: d.updated_at ? new Date(d.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  // /about has its own flag: it is not part of the Experience launch.
  if (flags.showAbout) {
    entries.push({ url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 });
  }

  // experience world, appears the day the flag flips
  if (flags.showExperience) {
    entries.push({ url: `${SITE}/experience`, lastModified: now, changeFrequency: "weekly", priority: 0.9 });
    // website_visible postdates the generated DB types (migration 059), cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: exps } = await (supabase as any)
      .from("exp_experiences")
      .select("slug,status,website_visible,page_template")
      .eq("status", "published");
    const listed = ((exps ?? []) as { slug: string | null; website_visible: boolean | null; page_template: string | null }[])
      .filter((e): e is typeof e & { slug: string } => !!e.slug && e.website_visible !== false);
    /* A clinic series with nothing coming up is not a page: the experience page
     * 404s when getEventRuns() comes back empty
     * (src/app/experience/[slug]/page.tsx). So an event experience is only
     * listed while it still has an upcoming run, asked through that very
     * function so the two can never disagree. Only event rows pay for the
     * lookup; a trip is a page whether or not a week is left. If the lookup
     * itself fails the clinic sits out this hour's sitemap, which costs
     * nothing, rather than taking the whole sitemap down with it. */
    const live = await Promise.all(
      listed.map(async (e) =>
        e.page_template === "event"
          ? (await getEventRuns(e.slug).catch(() => [])).length > 0
          : true,
      ),
    );
    listed.forEach((e, i) => {
      if (!live[i]) return;
      entries.push({ url: `${SITE}/experience/${e.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
    });
  }

  return entries;
}
