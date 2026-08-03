import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpotguideDestination, getDestinationVisibility, getPublishedDestinationSlugs } from "@/lib/spotguide-data";
import { DestinationView } from "./destination-view";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await getSpotguideDestination(slug);
  if (!d) return { title: "Spotguide" };
  const description = d.tagline ?? `Windsurf spots in ${d.name}, rated by NP7 and the crew — conditions, wind windows and the forecast that actually works.`;
  return {
    // bare title — the root layout template appends "· NP7"
    title: `${d.name} windsurf spotguide`,
    description,
    alternates: { canonical: `/spotguide/${slug}` },
    ...(d.hero_image
      ? {
          openGraph: { title: `${d.name} windsurf spotguide`, description, url: `/spotguide/${slug}`, images: [{ url: d.hero_image, alt: `Windsurfing in ${d.name}` }] },
          twitter: { card: "summary_large_image" as const, title: `${d.name} windsurf spotguide`, description, images: [d.hero_image] },
        }
      : {}),
  };
}

export const revalidate = 3600;

/**
 * PUBLISHED areas only, prerendered so they serve from the CDN instead of
 * costing a full server render per hit (measured before: `no-store`, 1.1–1.7 s,
 * on every request including every crawler).
 *
 * This route must NEVER touch a request API — not for any param. It renders the
 * anonymous shape for everyone; the signup gate and the viewer's own pending
 * spots are resolved client-side by SpotguideProvider. Rider-proposed drafts
 * live on /spotguide/proposed/[slug], which is force-dynamic: an unlisted param
 * here would render through the STATIC path, where cookies() is a hard error.
 *
 * dynamicParams stays at its default (true) so an area published after the last
 * build renders on demand and then caches, rather than 404-ing until a redeploy.
 */
export async function generateStaticParams() {
  return (await getPublishedDestinationSlugs()).map((slug) => ({ slug }));
}

export default async function SpotguideDestinationPage({ params }: Props) {
  const { slug } = await params;
  // A draft is not servable here — it needs the viewer, and this route is cached.
  const vis = await getDestinationVisibility(slug);
  if (!vis.exists || vis.isDraft) notFound();

  // Deliberately NO request APIs here — not `?from=`, not the np7_section
  // cookie. This route was right to refuse them: an unlisted slug renders
  // through the STATIC path, where a request API bails the render out to
  // `revalidate: 0` and Next throws "Page changed from static to dynamic at
  // runtime" — a 500, not a dynamic render. (The magazine's post page assumed
  // the opposite; its generateStaticParams comment now says so.)
  //
  // The rest of the shared pages have caught up: they settle the world in the
  // browser (section-world.tsx) instead of gating a cookie read on
  // `flags.showHardware`, so nothing here has to change when SHOW_HARDWARE
  // flips. DestinationView still pins its header to Experience on this route —
  // it cannot know the reader's world, and must not try.
  return <DestinationView slug={slug} viewerId={null} isTeam={false} />;
}
