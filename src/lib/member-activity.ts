import "server-only";
import { createAdminClient } from "@/lib/supabase";

/**
 * One timeline of what members have actually done.
 *
 * The signals were spread across a dozen tables, each only visible if you
 * happened to open the right page: a booking here, a spot rating there, a
 * waiver somewhere else. Nobody could answer "what happened today?".
 *
 * Split into two kinds, because they lead to different work:
 *  - trip     — money and logistics. Someone booked, paid, signed, asked for
 *               an extra. These usually need a reply.
 *  - community — spotguide contributions, levels, gear. Good to see, rarely
 *               urgent, and it would drown the trip signal if mixed in.
 *
 * Deliberately read-only and best-effort per source: a table that doesn't
 * exist yet (or a query that fails) drops out silently rather than emptying
 * the whole feed.
 */

export type ActivityKind = "trip" | "community";

export type ActivityItem = {
  id: string;
  at: string;
  kind: ActivityKind;
  /** short verb phrase, e.g. "Signed the waiver" */
  action: string;
  /** what it was about, e.g. the trip or spot name */
  subject: string | null;
  contactId: string | null;
  contactName: string | null;
  /** where to go to act on it */
  href: string | null;
};

const LIMIT_PER_SOURCE = 60;

export async function getMemberActivity(limit = 120): Promise<ActivityItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const items: ActivityItem[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = async (fn: () => Promise<any>) => { try { return await fn(); } catch { return { data: [] }; } };

  const [bookings, payments, waivers, addons, applications, ratings, photos, newSpots, edits, levels, orders] =
    await Promise.all([
      safe(() => db.from("exp_bookings").select("id, name, created_at, contact_id, contacts(name), exp_experiences(title)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("exp_payments").select("id, amount, paid_at, created_at, contact_id, booking_id, contacts(name)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("exp_waiver_signatures").select("id, signed_at, created_at, contact_id, booking_id, contacts(name)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("exp_booking_addons").select("id, label, requested_at, booking_id, source, exp_bookings(name, contact_id, contacts(name))").not("requested_at", "is", null).order("requested_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("exp_trip_applications").select("id, name, created_at, contact_id").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("spot_ratings").select("id, created_at, contact_id, contacts(name), spots(name)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("spot_photos").select("id, created_at, contact_id, contacts(name), spots(name)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("spots").select("id, name, created_at, submitted_by, source").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("spot_edits").select("id, field, created_at, contact_id, contacts(name), spots(name)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("contact_level_history").select("id, level, created_at, contact_id, source, contacts(name)").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      safe(() => db.from("hw_orders").select("id, display_number, created_at, contact_id").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
    ]);

  const push = (i: ActivityItem) => { if (i.at) items.push(i); };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameOf = (r: any) => r?.contacts?.name ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bookings.data ?? []) as any[]) {
    push({ id: `booking:${b.id}`, at: b.created_at, kind: "trip", action: "Booked a trip",
      subject: b.exp_experiences?.title ?? b.name ?? null, contactId: b.contact_id, contactName: nameOf(b),
      href: `/admin/bookings/${b.id}` });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (payments.data ?? []) as any[]) {
    push({ id: `payment:${p.id}`, at: p.paid_at ?? p.created_at, kind: "trip", action: "Payment recorded",
      subject: p.amount != null ? `€${Number(p.amount).toLocaleString("en-US")}` : null,
      contactId: p.contact_id, contactName: nameOf(p),
      href: p.booking_id ? `/admin/bookings/${p.booking_id}?tab=payments` : "/admin/payments" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const w of (waivers.data ?? []) as any[]) {
    // Link to the signature itself, not the booking — "signed the waiver" should
    // open the waiver.
    push({ id: `waiver:${w.id}`, at: w.signed_at ?? w.created_at, kind: "trip", action: "Signed the waiver",
      subject: null, contactId: w.contact_id, contactName: nameOf(w),
      href: `/admin/waivers/${w.id}` });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (addons.data ?? []) as any[]) {
    push({ id: `addon:${a.id}`, at: a.requested_at, kind: "trip", action: "Requested an add-on",
      subject: a.label ?? null, contactId: a.exp_bookings?.contact_id ?? null,
      contactName: a.exp_bookings?.contacts?.name ?? null,
      href: a.booking_id ? `/admin/bookings/${a.booking_id}?tab=addons` : null });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (applications.data ?? []) as any[]) {
    push({ id: `application:${t.id}`, at: t.created_at, kind: "trip", action: "Applied for a Signature trip",
      subject: null, contactId: t.contact_id, contactName: t.name ?? null, href: "/admin/signature-trips" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (ratings.data ?? []) as any[]) {
    push({ id: `rating:${r.id}`, at: r.created_at, kind: "community", action: "Rated a spot",
      subject: r.spots?.name ?? null, contactId: r.contact_id, contactName: nameOf(r), href: "/admin/destinations" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ph of (photos.data ?? []) as any[]) {
    push({ id: `spotphoto:${ph.id}`, at: ph.created_at, kind: "community", action: "Added a spot photo",
      subject: ph.spots?.name ?? null, contactId: ph.contact_id, contactName: nameOf(ph), href: "/admin/destinations" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const sp of (newSpots.data ?? []) as any[]) {
    if (!sp.submitted_by) continue; // jibe's own imports aren't member activity
    push({ id: `spot:${sp.id}`, at: sp.created_at, kind: "community", action: "Proposed a new spot",
      subject: sp.name ?? null, contactId: sp.submitted_by, contactName: null, href: "/admin/destinations" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (edits.data ?? []) as any[]) {
    push({ id: `spotedit:${e.id}`, at: e.created_at, kind: "community", action: "Suggested a spot edit",
      subject: [e.spots?.name, e.field].filter(Boolean).join(" · ") || null,
      contactId: e.contact_id, contactName: nameOf(e), href: "/admin/destinations" });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (levels.data ?? []) as any[]) {
    push({ id: `level:${l.id}`, at: l.created_at, kind: "community", action: "Level updated",
      subject: l.level ?? null, contactId: l.contact_id, contactName: nameOf(l),
      href: l.contact_id ? `/admin/members/${l.contact_id}` : null });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (orders.data ?? []) as any[]) {
    push({ id: `order:${o.id}`, at: o.created_at, kind: "community", action: "Placed a hardware order",
      subject: o.display_number ? `#${o.display_number}` : null, contactId: o.contact_id, contactName: null,
      href: `/admin/orders` });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, limit);
}
