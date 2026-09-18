import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { flags } from "@/lib/flags";
import { canSeeExperienceWorld } from "@/lib/auth";
import { redirectToMemberLogin } from "@/lib/member-gate";
import { getDestination, DestinationView } from "./destination-view";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // The layout 404s this whole segment until SHOW_EXPERIENCE is on — but a layout
  // short-circuits AFTER metadata and the page body have already run, so every
  // crawler hit on a dead /destinations/… URL was paying a full render (measured:
  // 42 kB of Bonaire markup behind an HTTP 404). Bail before touching the DB.
  if (!flags.showExperience) return { title: "Destination · NP7" };
  const { slug } = await params;
  const res = await getDestination(slug).catch(() => null);
  if (!res) return { title: "Destination · NP7" };
  const d = res.destination;
  return { title: `${d.name} · NP7 Destinations`, description: d.tagline || d.intro || `Windsurf ${d.name}` };
}

export default async function DestinationPage({ params }: Props) {
  // Same guard as generateMetadata above — decided before any query or render
  // work. A member may see this page, so a logged-out visitor is asked to sign
  // in and returned HERE rather than told it does not exist. The slug is read
  // first on purpose: the middleware does not stamp x-np7-pathname on
  // /destinations, so this is the only place that knows which page was wanted,
  // and sending everyone to the index would lose the link they followed.
  const { slug } = await params;
  if (!(await canSeeExperienceWorld(flags.showExperience))) await redirectToMemberLogin(`/destinations/${slug}`);
  const res = await getDestination(slug).catch(() => null);
  if (!res) notFound();
  return <DestinationView res={res} />;
}
