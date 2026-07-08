import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { flags } from "@/lib/flags";

const SITE = "https://www.np-seven.com";

/**
 * DB-driven sitemap: magazine (index + tab routes + every published post) and
 * the spotguide (index + every destination). Experience surfaces join
 * automatically the day SHOW_EXPERIENCE goes live — no code change needed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    // /blog/spotguide now 308s → /spotguide (the product); don't list the redirect.
    { url: `${SITE}/blog/gear`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/blog/technique`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/spotguide`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];

  // magazine posts
  const { data: posts } = await supabase
    .from("exp_blog_posts")
    .select("slug,published_at,updated_at")
    .eq("status", "published");
  for (const p of posts ?? []) {
    entries.push({
      url: `${SITE}/blog/${p.slug}`,
      lastModified: new Date(p.updated_at ?? p.published_at ?? now),
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  // spotguide destinations (public-readable; only ones with a live slug).
  // `destinations` postdates the generated DB types — repo convention is to cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dests } = await (supabase as any)
    .from("destinations")
    .select("slug,updated_at,status")
    .not("slug", "is", null);
  for (const d of (dests ?? []) as { slug: string; updated_at: string | null; status: string | null }[]) {
    if (d.status && !["published", "live", "active"].includes(String(d.status))) continue;
    entries.push({
      url: `${SITE}/spotguide/${d.slug}`,
      lastModified: d.updated_at ? new Date(d.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  // experience world — appears the day the flag flips
  if (flags.showExperience) {
    entries.push({ url: `${SITE}/experience`, lastModified: now, changeFrequency: "weekly", priority: 0.9 });
    entries.push({ url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 });
    // website_visible postdates the generated DB types (migration 059) — cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: exps } = await (supabase as any)
      .from("exp_experiences")
      .select("slug,status,website_visible")
      .eq("status", "published");
    for (const e of (exps ?? []) as { slug: string | null; website_visible: boolean | null }[]) {
      if (!e.slug || e.website_visible === false) continue;
      entries.push({ url: `${SITE}/experience/${e.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
    }
  }

  return entries;
}
