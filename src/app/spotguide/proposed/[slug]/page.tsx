import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPortalUser, getTeamMember } from "@/lib/auth";
import { getDestinationVisibility } from "@/lib/spotguide-data";
import { flags } from "@/lib/flags";
import { DestinationView } from "../../[slug]/destination-view";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> };

// Members-only staging surface — never index a place that isn't in the guide yet.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A rider-proposed area, still collecting its 3 confirms.
 *
 * Force-dynamic on purpose. It resolves the viewer — a member sees the area they
 * proposed (otherwise its first spots could never collect the verifications that
 * publish it: chicken-and-egg), and the team sees every pending spot on it. That
 * makes the render personal, so it must never be cached or shared.
 *
 * It lives on its own path because /spotguide/[slug] is prerendered, and a route
 * with generateStaticParams renders an unlisted param through the STATIC path,
 * where cookies() fails outright ("Page changed from static to dynamic at
 * runtime"). Once the area is published it moves to /spotguide/<slug>, and the
 * redirect below sends anyone holding the old link there.
 */
export const dynamic = "force-dynamic";

export default async function ProposedDestinationPage({ params, searchParams }: Props) {
  const { slug } = await params;

  const vis = await getDestinationVisibility(slug);
  if (!vis.exists) notFound();
  // Published in the meantime (often BECAUSE this page collected the confirms)
  // — send them to the real, cached page rather than serving a second copy.
  if (!vis.isDraft) {
    const { redirect } = await import("next/navigation");
    redirect(`/spotguide/${slug}`);
  }

  const [user, team] = await Promise.all([
    getPortalUser().catch(() => null),
    getTeamMember().catch(() => null),
  ]);
  // Anonymous visitors get a plain 404 — a proposed area is not public yet.
  // (DestinationView 404s too when the data layer withholds it, this is just the
  // cheap early exit.)
  if (!user && !team) notFound();

  const from = flags.showHardware ? (await searchParams).from : undefined;
  const store = flags.showHardware ? await cookies() : null;

  return (
    <DestinationView
      slug={slug}
      viewerId={user?.contactId ?? null}
      isTeam={!!team}
      from={from}
      sectionCookie={store?.get("np7_section")?.value}
    />
  );
}
