import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeamMember, getEffectiveAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { normalizeBookingStatus } from "@/lib/types";

// GET /api/admin/dashboard — one aggregated payload for the ops dashboard.
// Middleware already gates this to active team members.
export async function GET() {
  // Finance figures are owner-only — don't even send them to managers.
  // A role-based member additionally needs the `money` field grant to see ANY
  // money (booking prices, add-on prices) — so a photographer sees no numbers.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const member = user ? await getActiveTeamMember(user) : null;
  const isOwner = member?.accessLevel === "owner";
  const access = member ? await getEffectiveAccess(member) : null;
  const showMoney = !access || effectiveCanSeeField(access, "money");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  const head = (table: string, build?: (q: any) => any) => {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (build) q = build(q);
    return q;
  };

  const [
    expCount, bookCount, contactCount, upcomingEditionsCount,
    latestBookings, upcomingEditions, recentEmails, overdueTodos,
    openBookings, unmatchedPayments, pendingAddonRows,
  ] = await Promise.all([
    head("exp_experiences"),
    head("exp_bookings"),
    head("contacts"),
    head("exp_editions", (q: any) => q.gte("date_start", today).eq("status", "published")),
    db.from("exp_bookings").select("id,name,status,agreed_price,created_at,exp_experiences(title)").order("created_at", { ascending: false }).limit(6),
    db.from("exp_editions").select("id,label,year,date_start,date_end,max_spots,spots_taken,exp_experiences(title,slug)").gte("date_start", today).order("date_start", { ascending: true }).limit(6),
    db.from("email_log").select("template_key,to_email,status,subject,sent_at,created_at").order("created_at", { ascending: false }).limit(6),
    head("todos", (q: any) => q.lt("due_date", today).not("status", "in", "(done,completed,cancelled,archived)")),
    // open revenue: not-yet-fully-paid live bookings
    db.from("exp_bookings").select("agreed_price").eq("final_payment_received", false).not("status", "in", "(lost,attended,cancelled)"),
    head("exp_payments", (q: any) => q.eq("unmatched", true)),
    // add-ons a member requested and the team hasn't confirmed yet
    db.from("exp_booking_addons").select("id,booking_id,label,price,exp_bookings(name)").eq("status", "requested").order("requested_at", { ascending: false, nullsFirst: false }).limit(20),
  ]);

  const sum = (rows: { agreed_price: number | null }[] | null) =>
    (rows ?? []).reduce((a, r) => a + (Number(r.agreed_price) || 0), 0);

  // ── Photo tasks ───────────────────────────────────────────────────────────
  // For a photographer (and anyone), surface the outstanding photo work:
  //  1) Started editions whose committed participants have no personal photos yet
  //     (storage assets/memories/{editionId}/p/{bookingId}/), and which people.
  //  2) On-website experiences whose content is missing a hero or gallery.
  // Both are best-effort + tolerant (storage/columns may not exist yet).
  const COMMITTED = new Set(["confirmed", "paid", "attended"]);
  type PhotoTask = { editionId: string; label: string; total: number; missing: { id: string; name: string }[] };
  type ContentGap = { experienceId: string; title: string; missing: string[] };
  const photoTasks: PhotoTask[] = [];
  const contentGaps: ContentGap[] = [];
  try {
    const { data: startedEds } = await db.from("exp_editions")
      .select("id,label,year,date_start,status,exp_experiences(title)")
      .lte("date_start", today).neq("status", "archived")
      .order("date_start", { ascending: false }).limit(12);
    const eds = (startedEds ?? []) as any[];
    const edIds = eds.map((e: any) => e.id);
    if (edIds.length) {
      const { data: bRows } = await db.from("exp_bookings").select("id,name,status,edition_id").in("edition_id", edIds);
      const byEd = new Map<string, { id: string; name: string | null }[]>();
      for (const b of (bRows ?? []) as any[]) {
        if (!COMMITTED.has(normalizeBookingStatus(b.status))) continue;
        const arr = byEd.get(b.edition_id) ?? [];
        arr.push({ id: b.id, name: b.name });
        byEd.set(b.edition_id, arr);
      }
      // Which bookings already have a personal-photo folder, per edition.
      const haveByEd = await Promise.all(eds.map(async (e: any) => {
        try {
          const { data } = await db.storage.from("assets").list(`memories/${e.id}/p`, { limit: 500 });
          return new Set((data ?? []).filter((f: any) => f.name !== ".emptyFolderPlaceholder").map((f: any) => f.name));
        } catch { return new Set<string>(); }
      }));
      eds.forEach((e: any, i: number) => {
        const parts = byEd.get(e.id) ?? [];
        if (!parts.length) return;
        const have = haveByEd[i] as Set<string>;
        const missing = parts.filter((p) => !have.has(p.id)).map((p) => ({ id: p.id, name: p.name || "Guest" }));
        if (missing.length) photoTasks.push({ editionId: e.id, label: `${e.exp_experiences?.title ?? "Experience"} · ${e.label || e.year || ""}`.trim(), total: missing.length, missing: missing.slice(0, 8) });
      });
    }

    const { data: exps } = await db.from("exp_experiences").select("id,title,hero_image,gallery,status,website_visible").eq("status", "published");
    const visible = ((exps ?? []) as any[]).filter((e) => e.website_visible !== false);
    const ids = visible.map((e) => e.id);
    const { data: content } = ids.length ? await db.from("exp_content").select("experience_id,hero_image,gallery").in("experience_id", ids) : { data: [] };
    const cByExp = new Map(((content ?? []) as any[]).map((c) => [c.experience_id, c]));
    for (const e of visible) {
      const c = cByExp.get(e.id);
      const hero = c?.hero_image || e.hero_image;
      const gallery = (Array.isArray(c?.gallery) && c.gallery.length ? c.gallery : e.gallery) ?? [];
      const missing: string[] = [];
      if (!hero) missing.push("hero image");
      if (!Array.isArray(gallery) || gallery.filter(Boolean).length === 0) missing.push("gallery");
      if (missing.length) contentGaps.push({ experienceId: e.id, title: e.title, missing });
    }
  } catch { /* storage or tables not ready — leave empty */ }

  return NextResponse.json({
    counts: {
      experiences: expCount.count ?? 0,
      bookings: bookCount.count ?? 0,
      contacts: contactCount.count ?? 0,
      upcomingEditions: upcomingEditionsCount.count ?? 0,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    latestBookings: (latestBookings.data ?? []).map((b: any) => (showMoney ? b : { ...b, agreed_price: null })),
    upcomingEditions: upcomingEditions.data ?? [],
    recentEmails: recentEmails.data ?? [],
    overdueTodos: overdueTodos.count ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingAddons: (pendingAddonRows.data ?? []).map((a: any) => ({ id: a.id, bookingId: a.booking_id, label: a.label, price: showMoney ? a.price : null, bookingName: a.exp_bookings?.name ?? "Booking" })),
    finance: isOwner && showMoney
      ? { openRevenue: sum(openBookings.data), unmatchedPayments: unmatchedPayments.count ?? 0 }
      : null,
    // A restricted (no-money) role gets a slimmed dashboard focused on photo work.
    slim: !showMoney,
    photoTasks,
    contentGaps,
  });
}
