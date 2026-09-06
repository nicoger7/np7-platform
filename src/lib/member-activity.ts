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
 *  - trip     — the people arriving and the money. Someone signed up, booked,
 *               paid, signed, asked for an extra. Most of these need a reply,
 *               and a sign-up is where the booking pipeline literally starts.
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

/** How a member reached us, said in words. The raw column holds intake slugs. */
const SIGNUP_ORIGIN: Record<string, string> = {
  "website-register": "Registered on the site",
  "newsletter": "Came from the newsletter",
  "signature-apply": "Signature application",
  "website-event": "From an event page",
  "survey_open_link": "From a survey link",
  "instagram": "From Instagram",
};

/**
 * Accounts created, newest first.
 *
 * The timestamp has to come from the auth user, NOT from contacts.created_at.
 * Most people are already a contact long before they ever sign in: 53 of the
 * first 90 accounts belonged to someone we had already met, a newsletter
 * subscriber or a past guest. Dating those by the contact row would file
 * today's sign-up under the day we imported the mailing list.
 *
 * There is no view over auth.users and this does not add one. Exposing that
 * table through PostgREST is the classic way to leak every address in the
 * system, so this goes through the service-role admin API the same way
 * lib/members.ts already does. The whole user base is under a hundred, so one
 * page covers it.
 */
async function getSignups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<ActivityItem[]> {
  const [users, linked, staff] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 200 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => r?.data?.users ?? []).catch(() => []),
    db.from("contacts").select("id, name, auth_user_id, created_at, source")
      .not("auth_user_id", "is", null).limit(2000)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => r?.data ?? []).catch(() => []),
    db.from("team_members").select("auth_user_id").not("auth_user_id", "is", null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => r?.data ?? []).catch(() => []),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byUser = new Map<string, any>(linked.map((c: any) => [c.auth_user_id, c]));
  // A colleague getting a login is not a member signing up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isStaff = new Set<string>(staff.map((t: any) => t.auth_user_id));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (users as any[])
    .filter((u) => u.created_at && !isStaff.has(u.id))
    // Placeholder logins the platform mints for itself, never a person.
    .filter((u) => !String(u.email ?? "").endsWith("@np7.internal"))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    // No 60-row cap here, unlike every other source. Nico: "all the members that
    // already registered". There are under a hundred of them and each one
    // happened exactly once, so the whole membership fits and truncating it
    // would silently drop the earliest members from their own timeline.
    .map((u) => {
      const c = byUser.get(u.id);
      // Somebody we already knew, rather than a stranger off the website. Five
      // minutes of slack because a fresh signup writes both rows at once.
      const known = c?.created_at
        ? new Date(c.created_at).getTime() < new Date(u.created_at).getTime() - 5 * 60_000
        : false;
      const origin = SIGNUP_ORIGIN[String(c?.source ?? "")] ?? null;
      return {
        id: `signup:${u.id}`,
        at: u.created_at as string,
        kind: "trip" as const,
        action: "Signed up",
        subject: [origin, known ? "already a contact" : null].filter(Boolean).join(" · ") || null,
        contactId: c?.id ?? null,
        // An account with no contact row can sign in but has no CRM record, so
        // show the address rather than an anonymous row.
        contactName: c?.name ?? u.email ?? null,
        href: c?.id ? `/admin/members/${c.id}` : "/admin/members",
      };
    });
}

export async function getMemberActivity(limit = 120): Promise<ActivityItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const items: ActivityItem[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = async (fn: () => Promise<any>) => { try { return await fn(); } catch { return { data: [] }; } };

  const [signups, bookings, payments, waivers, addons, applications, ratings, photos, newSpots, edits, levels, orders] =
    await Promise.all([
      getSignups(db).catch(() => [] as ActivityItem[]),
      safe(() => db.from("exp_bookings").select("id, name, created_at, contact_id, contacts(name), exp_experiences(title), notes").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
      // The booking embed is not decoration: most payment rows carry no contact_id
      // of their own and are tied to the payer only through the booking, so
      // without it every one of them renders as "A member". Same embed shape the
      // add-ons query already uses.
      safe(() => db.from("exp_payments").select("id, amount, received_at, created_at, contact_id, booking_id, contacts(name), exp_bookings(contact_id, contacts(name))").order("created_at", { ascending: false }).limit(LIMIT_PER_SOURCE)),
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
  for (const s of signups) push(s);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameOf = (r: any) => r?.contacts?.name ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bookings.data ?? []) as any[]) {
    // Backfilled pre-platform trips carry an [ARCHIVE] note — logged for the
    // loyalty ladder, not news. The feed must not read them as fresh bookings.
    if (String(b.notes ?? "").includes("[ARCHIVE]")) continue;
    push({ id: `booking:${b.id}`, at: b.created_at, kind: "trip", action: "Booked a trip",
      subject: b.exp_experiences?.title ?? b.name ?? null, contactId: b.contact_id, contactName: nameOf(b),
      href: `/admin/bookings/${b.id}` });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (payments.data ?? []) as any[]) {
    push({ id: `payment:${p.id}`, at: p.received_at ?? p.created_at, kind: "trip", action: "Payment recorded",
      subject: p.amount != null ? `€${Number(p.amount).toLocaleString("en-US")}` : null,
      contactId: p.contact_id ?? p.exp_bookings?.contact_id ?? null,
      contactName: nameOf(p) ?? p.exp_bookings?.contacts?.name ?? null,
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
  const top = items.slice(0, limit);

  /* PUT THE NAMES BACK ON.
     Several sources carry only a contact id: a proposed spot has submitted_by,
     a hardware order has contact_id, and an embed that comes back null leaves a
     booking or a payment nameless too. Those rows rendered as "A member", which
     is the one thing a feed of who-did-what must not say, and three of them were
     sitting at the top of the page.
     One lookup for whatever is still missing, after the slice so it only ever
     covers rows that will actually be shown. Best-effort like every other
     source: if it fails the feed keeps its ids and reads as it did before. */
  const missing = [...new Set(top.filter((i) => !i.contactName && i.contactId).map((i) => i.contactId as string))];
  if (missing.length) {
    const { data } = await safe(() => db.from("contacts").select("id, name").in("id", missing));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = new Map<string, string | null>((data ?? []).map((c: any) => [c.id as string, (c.name ?? null) as string | null]));
    for (const i of top) {
      if (!i.contactName && i.contactId) i.contactName = names.get(i.contactId) ?? null;
    }
  }
  return top;
}
