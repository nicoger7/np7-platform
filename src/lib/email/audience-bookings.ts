import "server-only";
import { createAdminClient } from "@/lib/supabase";

/**
 * Audience by what people actually DID, not by how they were once tagged.
 *
 * The tag-based picker looked smart and wasn't: 19 of the 20 Lake Garda 2026
 * participants carry the tag `Clinic` (a leftover from the Notion import), so
 * "everyone tagged Experience Participant" silently excluded almost every Garda
 * guest from a survey about Garda. Meanwhile the contacts it DID find were
 * mostly imported newsletter rows who have never been on a trip.
 *
 * Bookings are the truth and nobody has to maintain them — they are written by
 * the act of booking. This resolves a booking-shaped filter down to contact ids
 * that the existing contacts query can then intersect with.
 */

export type BookingFilters = {
  /** any-of — experiences they booked */
  experienceIds?: string[];
  /** any-of — specific weeks */
  editionIds?: string[];
  /** any-of — season year of the edition */
  years?: number[];
  /**
   * any-of booking status. "attended" and "paid" mean they actually came;
   * "lead" means they once enquired and never did — very different audiences,
   * so this is never defaulted.
   */
  statuses?: string[];
};

export function hasBookingFilter(f: BookingFilters | undefined | null): boolean {
  if (!f) return false;
  return !!(f.experienceIds?.length || f.editionIds?.length || f.years?.length || f.statuses?.length);
}

/**
 * Contact ids matching the booking filter. Returns null when no booking filter
 * is set, so callers can tell "not filtering by bookings" from "filtered and
 * matched nobody" — conflating those two is how you accidentally email everyone.
 */
export async function contactIdsFromBookings(f: BookingFilters): Promise<string[] | null> {
  if (!hasBookingFilter(f)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Years resolve to editions first — the year lives on the edition, not the booking.
  let editionIds = f.editionIds ? [...f.editionIds] : [];
  if (f.years?.length) {
    let q = db.from("exp_editions").select("id").in("year", f.years);
    if (f.experienceIds?.length) q = q.in("experience_id", f.experienceIds);
    const { data } = await q;
    const found = (data ?? []).map((e: { id: string }) => e.id);
    editionIds = editionIds.length ? editionIds.filter((id) => found.includes(id)) : found;
    // A year filter that matches no edition must match no contact, rather than
    // silently falling through to "everyone".
    if (!editionIds.length) return [];
  }

  let q = db.from("exp_bookings").select("contact_id").not("contact_id", "is", null);
  if (editionIds.length) q = q.in("edition_id", editionIds);
  else if (f.experienceIds?.length) q = q.in("experience_id", f.experienceIds);
  if (f.statuses?.length) q = q.in("status", f.statuses);

  const { data } = await q;
  return [...new Set((data ?? []).map((b: { contact_id: string }) => b.contact_id))] as string[];
}

/** Experiences + editions + the statuses actually in use, for the picker UI. */
export async function getAudienceOptions(): Promise<{
  experiences: { id: string; title: string }[];
  editions: { id: string; experienceId: string; label: string; year: number | null; dateStart: string | null }[];
  statuses: string[];
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: exps }, { data: eds }, { data: statuses }] = await Promise.all([
    db.from("exp_experiences").select("id, title").is("archived_at", null).order("title"),
    db.from("exp_editions").select("id, experience_id, label, year, date_start").is("archived_at", null).order("date_start", { ascending: false }),
    db.from("exp_bookings").select("status"),
  ]);
  return {
    experiences: (exps ?? []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title })),
    editions: (eds ?? []).map((e: { id: string; experience_id: string; label: string | null; year: number | null; date_start: string | null }) => ({
      id: e.id, experienceId: e.experience_id, year: e.year, dateStart: e.date_start,
      label: e.label?.trim() || String(e.year ?? "—"),
    })),
    statuses: [...new Set(((statuses ?? []) as { status: string | null }[]).map((s) => s.status).filter(Boolean))] as string[],
  };
}
