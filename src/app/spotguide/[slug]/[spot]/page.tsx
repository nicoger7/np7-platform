import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpotguideDestination, getPublishedDestinationSlugs } from "@/lib/spotguide-data";
import { DestinationView } from "../destination-view";

/**
 * One spot, at a URL worth pasting: /spotguide/sorlandet/ashavn.
 *
 * Spots were only ever anchors on the destination page, keyed by their database
 * uuid, so sharing one meant sending someone
 * `/spotguide/sorlandet#spot-8a749aff-c8de-44d5-885b-674839cc971c`. Every spot
 * already had a slug sitting unused; this spends it.
 *
 * It renders the SAME destination page with that spot opened and scrolled to,
 * rather than a separate cut-down page: a spot only makes sense next to its
 * neighbours, the map and the area's wind. The canonical points back at the
 * destination so the two URLs do not compete in search, while the title and
 * OpenGraph describe the spot, which is what a shared link previews as.
 */

type Props = { params: Promise<{ slug: string; spot: string }> };

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getPublishedDestinationSlugs();
  const out: { slug: string; spot: string }[] = [];
  for (const slug of slugs) {
    const d = await getSpotguideDestination(slug).catch(() => null);
    for (const s of d?.spots ?? []) if (s.slug) out.push({ slug, spot: s.slug });
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, spot } = await params;
  const d = await getSpotguideDestination(slug);
  const s = d?.spots.find((x) => x.slug === spot);
  if (!d || !s) return { title: "Spotguide" };
  const title = `${s.name} · ${d.name} windsurf spot`;
  const description = s.summary
    ?? `${s.name} in ${d.name}: conditions, wind window and what to know before you rig.`;
  const image = s.hero_image ?? d.hero_image;
  return {
    title,
    description,
    // The destination page is the canonical home of this content; this URL is
    // a deep link into it, not a competing copy.
    alternates: { canonical: `/spotguide/${slug}` },
    ...(image
      ? {
          openGraph: { title, description, url: `/spotguide/${slug}/${spot}`, images: [{ url: image, alt: `Windsurfing at ${s.name}` }] },
          twitter: { card: "summary_large_image" as const, title, description, images: [image] },
        }
      : {}),
  };
}

/**
 * Like its parent, this route touches NO request API — not `?from=`, not the
 * section cookie. Reading one turned every spot link into a server render (the
 * build printed this route as dynamic while the destinations stayed SSG), and
 * on a slug published since the last build it is worse than slow: an unlisted
 * param renders through the STATIC path, where a request API throws "Page
 * changed from static to dynamic at runtime". These are the URLs we paste into
 * chats, so they serve from the CDN. The world is settled in the browser.
 */
export default async function SpotPage({ params }: Props) {
  const { slug, spot } = await params;
  const d = await getSpotguideDestination(slug);
  if (!d || !d.spots.some((s) => s.slug === spot)) notFound();
  return <DestinationView slug={slug} viewerId={null} isTeam={false} focusSpot={spot} />;
}
