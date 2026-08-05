import { revalidatePath } from "next/cache";

/**
 * On-demand invalidation for the cached public pages.
 *
 * The public magazine, spotguide index and legal pages are ISR'd with long
 * windows (an hour; a day for legal) so ordinary traffic serves from the CDN
 * instead of paying a server render per hit. Those windows are only affordable
 * because nobody has to wait them out: every write that changes public content
 * calls in here.
 *
 * Called from Route Handlers, so per the Next docs this only MARKS a path — the
 * re-render happens on the next visit. Invalidating a route PATTERN
 * (`/blog/[slug]`) is therefore cheap: it does not fan out into one render per
 * slug, it just means the next visitor to any of them gets a fresh render.
 *
 * Each function invalidates only what can actually contain the changed data —
 * a member's spot rating cannot change a magazine article, so it doesn't touch
 * the magazine. Over-invalidating would quietly hand back the CPU we just saved.
 *
 * Never throws: a failed invalidation must not fail the write that triggered it,
 * which has already succeeded.
 */

const BLOG_LISTS = ["/blog", "/blog/gear", "/blog/technique", "/blog/spotguide"];
const LEGAL = ["/impressum", "/privacy", "/terms", "/widerrufsbelehrung"];
const SPOTGUIDE_INDEX = "/spotguide";
const SITEMAP = "/sitemap.xml";

function safe(paths: () => void) {
  try {
    paths();
  } catch (e) {
    console.error("[revalidate] failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * A magazine post changed.
 *
 * `previousSlug` matters on a RENAME: only the new path would otherwise be
 * refreshed, leaving the old URL serving the old article from cache until the
 * window expires. The `/blog/[slug]` pattern is invalidated too because every
 * other post renders a "More stories" list — without it a renamed or deleted
 * post keeps a dead link on a dozen cached pages.
 */
export function revalidateBlog(slug?: string | null, opts?: { previousSlug?: string | null }) {
  safe(() => {
    for (const p of BLOG_LISTS) revalidatePath(p);
    if (slug) revalidatePath(`/blog/${slug}`);
    if (opts?.previousSlug && opts.previousSlug !== slug) revalidatePath(`/blog/${opts.previousSlug}`);
    // the related-posts strip on every OTHER post
    revalidatePath("/blog/[slug]", "page");
    // a post's text decides which destination clusters link to it
    // (src/lib/spotguide-data.ts) — a no-op while /spotguide/[slug] is
    // force-dynamic, correct the moment it is cached.
    revalidatePath("/spotguide/[slug]", "page");
    revalidatePath(SITEMAP);
  });
}

/**
 * A destination or spot changed.
 *
 * `alsoMagazine` only for STRUCTURAL changes — a rename, a new/removed spot, a
 * publish/unpublish — because those change the destination names and links that
 * post pages render. Ratings, photos and forecast votes stay inside the
 * spotguide, so they must not flush the magazine.
 */
export function revalidateSpotguide(slug?: string | null, opts?: { alsoMagazine?: boolean }) {
  safe(() => {
    revalidatePath(SPOTGUIDE_INDEX);
    if (slug) revalidatePath(`/spotguide/${slug}`);
    else revalidatePath("/spotguide/[slug]", "page");
    if (opts?.alsoMagazine) {
      for (const p of BLOG_LISTS) revalidatePath(p);
      revalidatePath("/blog/[slug]", "page");
    }
    revalidatePath(SITEMAP);
  });
}

/**
 * Same as above, when the caller holds a destination ID rather than a slug —
 * the member-facing portal routes, which work in IDs. Takes the caller's own
 * Supabase client so this module stays free of DB wiring.
 *
 * Only for writes whose result is visible on the CACHED index (a new spot, a
 * verification, a rating that moves a destination's headline score). Per-spot
 * detail like a forecast vote or a photo score lives only on
 * /spotguide/[slug] — force-dynamic today — so invalidating for those would be
 * pure cost with nothing to refresh.
 */
export async function revalidateDestinationById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  destinationId: string | null | undefined,
  opts?: { alsoMagazine?: boolean },
) {
  if (!destinationId) return;
  try {
    const { data } = await db.from("destinations").select("slug").eq("id", destinationId).maybeSingle();
    revalidateSpotguide(data?.slug ?? null, opts);
  } catch (e) {
    console.error("[revalidate] destination lookup failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * An experience, edition, package, coach, or review changed — anything that
 * feeds the public /experience pages. The index lists all experiences; the
 * slug page renders editions, packages, coaches, and reviews for one
 * experience. The /destinations/[slug] pages also pull experience data.
 */
export function revalidateExperience(slug?: string | null) {
  safe(() => {
    revalidatePath("/experience");
    revalidatePath("/method");
    if (slug) revalidatePath(`/experience/${slug}`);
    else revalidatePath("/experience/[slug]", "page");
    revalidatePath("/destinations/[slug]", "page");
    revalidatePath(SITEMAP);
  });
}

/**
 * Same as above, when the caller holds an experience ID rather than a slug.
 */
export async function revalidateExperienceById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  experienceId: string | null | undefined,
) {
  if (!experienceId) return;
  try {
    const { data } = await db.from("exp_experiences").select("slug").eq("id", experienceId).maybeSingle();
    revalidateExperience(data?.slug ?? null);
  } catch (e) {
    console.error("[revalidate] experience lookup failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * A hardware product or its content changed.
 */
export function revalidateHardware(slug?: string | null) {
  safe(() => {
    revalidatePath("/hardware");
    revalidatePath("/hardware/fins");
    if (slug) revalidatePath(`/hardware/${slug}`);
    else revalidatePath("/hardware/[slug]", "page");
    revalidatePath(SITEMAP);
  });
}

/**
 * Company settings changed. The legal pages are cached for a DAY and every one
 * of them renders getLegalEntity() → company_settings, so without this an
 * address or VAT-id correction would sit unpublished on the Impressum.
 */
export function revalidateLegal() {
  safe(() => {
    for (const p of LEGAL) revalidatePath(p);
  });
}
