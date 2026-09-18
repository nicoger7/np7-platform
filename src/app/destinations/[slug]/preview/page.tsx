import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTeamMember } from "@/lib/auth";
import { getDestination, DestinationView } from "../destination-view";

/**
 * /destinations/<slug>/preview — the page exactly as publishing would show it,
 * drafts included, for the team only.
 *
 * Its own route rather than a team check on the public page: that page is ISR,
 * and reading the viewer's session there would make every destination render
 * per request for everyone (Vercel CPU, see the usage-cap memory). Here the
 * cost is paid only by the team, and a non-team visitor gets a plain 404.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview · NP7 Destinations",
  robots: { index: false, follow: false },
};

export default async function DestinationPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const team = await getTeamMember().catch(() => null);
  if (!team) notFound();
  const { slug } = await params;
  const res = await getDestination(slug, { draft: true }).catch(() => null);
  if (!res) notFound();
  return <DestinationView res={res} preview />;
}
