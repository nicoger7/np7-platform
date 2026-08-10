import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEventForSlug } from "@/lib/events";
import { getPortalUser, getTeamMember } from "@/lib/auth";
import { EventPage } from "@/components/experience/event-page";

/**
 * One particular clinic.
 *
 * /experience/np7-race-clinic       → the SERIES: sells whichever clinic runs next
 * /experience/np7-race-clinic/<ed>  → THIS clinic, whatever else is on sale
 *
 * A format that travels (migration 158) needs both. The series URL is the one
 * that lives in a bio and never goes stale; the edition URL is the one you put
 * in a WhatsApp group for that weekend, and it must keep pointing at that
 * weekend after the next clinic is added.
 *
 * Only event editions have a slug here, so this route never shadows a trip.
 * `balance` and `thanks` are static siblings and still win the match.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; edition: string }>;
  searchParams?: Promise<{ paid?: string; b?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, edition } = await params;
  const ev = await getEventForSlug(slug, { editionSlug: edition }).catch(() => null);
  if (!ev) return { title: { absolute: "Not found — NP7" } };
  const where = ev.location ? ` · ${ev.location}` : "";
  return {
    title: { absolute: `${ev.title}${where} — NP7` },
    description: ev.description ?? undefined,
  };
}

export default async function EventEditionPage({ params, searchParams }: Props) {
  const { slug, edition } = await params;
  const { paid, b: paidBookingId } = (await searchParams) ?? {};

  const event = await getEventForSlug(slug, { editionSlug: edition }).catch(() => null);
  if (!event) notFound();

  // Identical visibility rules to the series page — a link to one clinic must
  // not become a side door into an unpublished experience.
  const team = await getTeamMember().catch(() => null);
  if (!team && (event.status !== "published" || !event.websiteVisible)) notFound();

  const member = await getPortalUser().catch(() => null);
  return (
    <EventPage
      event={event}
      isMember={!!member?.contactId}
      paid={paid === "1"}
      paidBookingId={paidBookingId ?? null}
    />
  );
}
