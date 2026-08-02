import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeamMember, getEffectiveAccess } from "@/lib/admin-auth";
import { effectiveCanAccess, effectiveCanEnterWorld, effectiveCanSeeField } from "@/lib/access";
import { normalizeBookingStatus } from "@/lib/types";
import { getUpcomingMails } from "@/lib/email/upcoming";
import { getExperienceReadiness } from "@/lib/experience-readiness";

// GET /api/admin/dashboard — one aggregated payload for the ops dashboard.
// Each admin world gets its OWN payload (`?world=hardware|magazine`); the
// default is the Experience ops dashboard. Middleware already gates this to
// active team members.
export async function GET(request: NextRequest) {
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

  const world = request.nextUrl.searchParams.get("world");
  if (world === "hardware") {
    // Same world-entry rule the sidebar uses — no hardware numbers for roles
    // that can't open the hardware world at all.
    if (access && !effectiveCanEnterWorld(access, "hardware")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return hardwareDashboard(db, showMoney);
  }
  if (world === "magazine") {
    // Magazine is a UI-only grouping (not an RBAC world) — entry mirrors the
    // shell: reachable if the role can open the blog admin.
    if (access && !effectiveCanAccess(access, "/admin/blog")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return magazineDashboard(db);
  }
  if (world === "product-dev") {
    // A REAL RBAC world (it is in access.ts WORLDS), so entry goes through the
    // world grant — not the nav-derived path magazine uses. Owner-only for the
    // legacy tiers, which `effectiveCanAccess` on the section prefix enforces.
    if (access && (!effectiveCanEnterWorld(access, "product-dev") || !effectiveCanAccess(access, "/admin/product-dev"))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return productDevDashboard(db);
  }

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
    db.from("exp_booking_addons").select("id,booking_id,label,price,exp_bookings(name),exp_components(payment_mode)").eq("status", "requested").order("requested_at", { ascending: false, nullsFirst: false }).limit(20),
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

  // What the lifecycle cron is about to send. Tolerant: a forecast is never
  // worth failing the whole dashboard over.
  let upcomingMails: Awaited<ReturnType<typeof getUpcomingMails>> = { paused: true, mails: [] };
  try { upcomingMails = await getUpcomingMails(); } catch { /* leave empty */ }

  // What still needs writing before an experience goes public. Tolerant — a
  // checklist is never worth failing the dashboard over.
  let readiness: Awaited<ReturnType<typeof getExperienceReadiness>> = [];
  try { readiness = await getExperienceReadiness(); } catch { /* leave empty */ }

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
    pendingAddons: (pendingAddonRows.data ?? []).map((a: any) => ({
      id: a.id, bookingId: a.booking_id, label: a.label,
      price: showMoney ? a.price : null,
      bookingName: a.exp_bookings?.name ?? "Booking",
      // Pay-direct add-ons must never be charged — the quick-confirm here has to
      // follow the same rule as the booking page, or it would invoice money we
      // never collect.
      payDirect: a.exp_components?.payment_mode === "direct",
    })),
    finance: isOwner && showMoney
      ? { openRevenue: sum(openBookings.data), unmatchedPayments: unmatchedPayments.count ?? 0 }
      : null,
    // A restricted (no-money) role gets a slimmed dashboard focused on photo work.
    slim: !showMoney,
    photoTasks,
    contentGaps,
    upcomingMails,
    readiness,
  });
}

// ── NP7 Hardware world ───────────────────────────────────────────────────────
// Products-centric for now: catalog counts, freshest edits, and website-content
// gaps. Orders KPIs join once the shop backend exists.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hardwareDashboard(db: any, showMoney: boolean) {
  const live = (q: any) => q.is("archived_at", null);
  const head = (build?: (q: any) => any) => {
    let q = db.from("hw_products").select("id", { count: "exact", head: true });
    q = live(q);
    if (build) q = build(q);
    return q;
  };

  const [total, published, drafts, levelRows, receiptRows, poRows, latest, contentRows] = await Promise.all([
    head(),
    head((q: any) => q.eq("status", "published")),
    head((q: any) => q.eq("status", "draft")),
    // Physical stock only — the ledger's derived levels, not a mutable column.
    db.from("hw_stock_levels").select("variant_id,on_hand, hw_stock_locations!inner(is_virtual)")
      .eq("hw_stock_locations.is_virtual", false),
    db.from("hw_receipts").select("variant_id,unit_landed_cost,received_at").order("received_at", { ascending: false }),
    live(db.from("hw_purchase_orders").select("id,po_number,status,expected_receipt_date,currency,hw_suppliers(name),hw_po_lines(qty_ordered,qty_received)"))
      .not("status", "in", "(draft,closed,cancelled)")
      .order("expected_receipt_date", { ascending: true, nullsFirst: false }).limit(8),
    live(db.from("hw_products").select("id,name,category,status,price,updated_at,created_at"))
      .order("updated_at", { ascending: false, nullsFirst: false }).limit(6),
    live(db.from("hw_products").select("id,name,images,description").eq("status", "published")),
  ]);

  const [openOrders, latestOrders] = await Promise.all([
    db.from("hw_orders").select("id", { count: "exact", head: true }).eq("status", "pending").is("archived_at", null),
    db.from("hw_orders").select("id,display_number,email,status,payment_status,fulfillment_status,grand_total,placed_at,contacts(name)")
      .is("archived_at", null).order("placed_at", { ascending: false }).limit(6),
  ]);

  // Published products whose page still misses core website content
  // (mirrors the Experience "website photos missing" panel).
  type Gap = { productId: string; name: string; missing: string[] };
  const contentGaps: Gap[] = [];
  try {
    const products = (contentRows.data ?? []) as { id: string; name: string; images: string[] | null; description: string | null }[];
    const ids = products.map((p) => p.id);
    const { data: content } = ids.length
      ? await db.from("hw_product_content").select("product_id,hero_image,gallery,overview").in("product_id", ids)
      : { data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byProduct = new Map(((content ?? []) as any[]).map((c) => [c.product_id, c]));
    for (const p of products) {
      const c = byProduct.get(p.id);
      const missing: string[] = [];
      if (!(c?.hero_image || p.images?.[0])) missing.push("hero image");
      const gallery = (Array.isArray(c?.gallery) && c.gallery.length ? c.gallery : p.images) ?? [];
      if (gallery.filter(Boolean).length === 0) missing.push("gallery");
      if (!(c?.overview || p.description)) missing.push("overview");
      if (missing.length) contentGaps.push({ productId: p.id, name: p.name, missing });
    }
  } catch { /* content table not ready — leave empty */ }

  // Stock units + value at latest landed cost (receipts come newest-first).
  const latestCost = new Map<string, number>();
  for (const r of (receiptRows.data ?? []) as { variant_id: string; unit_landed_cost: number | null }[]) {
    if (r.unit_landed_cost != null && !latestCost.has(r.variant_id)) latestCost.set(r.variant_id, Number(r.unit_landed_cost));
  }
  let stockUnits = 0;
  let inventoryValue = 0;
  for (const lv of (levelRows.data ?? []) as { variant_id: string; on_hand: number }[]) {
    stockUnits += lv.on_hand;
    inventoryValue += lv.on_hand * (latestCost.get(lv.variant_id) ?? 0);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inboundPipeline = ((poRows.data ?? []) as any[]).map((po) => ({
    id: po.id,
    poNumber: po.po_number,
    status: po.status,
    expected: po.expected_receipt_date,
    supplier: po.hw_suppliers?.name ?? null,
    units: (po.hw_po_lines ?? []).reduce((a: number, l: { qty_ordered: number }) => a + l.qty_ordered, 0),
    received: (po.hw_po_lines ?? []).reduce((a: number, l: { qty_received: number }) => a + l.qty_received, 0),
  }));

  return NextResponse.json({
    world: "hardware",
    counts: {
      products: total.count ?? 0,
      published: published.count ?? 0,
      drafts: drafts.count ?? 0,
      stockUnits,
      openPos: inboundPipeline.length,
      openOrders: openOrders.count ?? 0,
    },
    finance: showMoney ? { inventoryValue } : null,
    inboundPipeline,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    latestOrders: ((latestOrders.data ?? []) as any[]).map((o) => ({
      id: o.id, number: o.display_number, email: o.contacts?.name ?? o.email,
      status: o.status, paymentStatus: o.payment_status, fulfillmentStatus: o.fulfillment_status,
      total: showMoney ? o.grand_total : null, placedAt: o.placed_at,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    latestProducts: (latest.data ?? []).map((p: any) => (showMoney ? p : { ...p, price: null })),
    contentGaps,
    slim: !showMoney,
  });
}

// ── Magazine world ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function magazineDashboard(db: any) {
  const [total, published, destinations, latest] = await Promise.all([
    db.from("exp_blog_posts").select("id", { count: "exact", head: true }),
    db.from("exp_blog_posts").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("destinations").select("id", { count: "exact", head: true }),
    db.from("exp_blog_posts").select("id,title,status,category,published_at,updated_at")
      .order("updated_at", { ascending: false, nullsFirst: false }).limit(6),
  ]);

  const posts = total.count ?? 0;
  const publishedCount = published.count ?? 0;
  return NextResponse.json({
    world: "magazine",
    counts: {
      posts,
      published: publishedCount,
      // status is draft-by-default (may be null) — count by subtraction.
      drafts: Math.max(0, posts - publishedCount),
      destinations: destinations.count ?? 0,
    },
    latestPosts: latest.data ?? [],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function productDevDashboard(db: any) {
  const [projects, molds, layupRows, plyCount, steps, sources] = await Promise.all([
    db.from("pd_projects").select("id", { count: "exact", head: true }).is("archived_at", null),
    db.from("pd_molds").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "in_use"),
    db.from("pd_layups")
      .select("id,project_id,name,ref,source_id,updated_at,pd_projects(name),pd_constructions(name),pd_molds(name)")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(50),
    db.from("pd_layup_plies").select("id", { count: "exact", head: true }),
    db.from("pd_process_steps")
      .select("id,step_no,title,source_id,photos,temp_c_min,pressure_t_min,duration_min,pd_processes(name,project_id)")
      .order("step_no"),
    db.from("pd_sources").select("id,received_at").is("archived_at", null),
  ]);

  // The build sheets and steps are tiny tables (tens of rows), so the staleness
  // join happens here rather than in SQL — no view, no extra round trip.
  const staleIds = new Set<string>();
  const knownIds = new Set<string>();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  for (const s of (sources.data ?? []) as { id: string; received_at: string | null }[]) {
    knownIds.add(s.id);
    if (s.received_at && new Date(s.received_at) < cutoff) staleIds.add(s.id);
  }
  const reasonFor = (sourceId: string | null): "missing" | "stale" | null =>
    !sourceId || !knownIds.has(sourceId) ? "missing" : staleIds.has(sourceId) ? "stale" : null;

  type LayupRow = {
    id: string; project_id: string; name: string; ref: string | null; source_id: string | null; updated_at: string;
    pd_projects?: { name: string } | null; pd_constructions?: { name: string } | null; pd_molds?: { name: string } | null;
  };
  type StepRow = {
    id: string; step_no: number; title: string; source_id: string | null; photos: unknown[] | null;
    temp_c_min: number | null; pressure_t_min: number | null; duration_min: number | null;
    pd_processes?: { name: string; project_id: string } | null;
  };
  const layups = (layupRows.data ?? []) as LayupRow[];
  const stepRows = (steps.data ?? []) as StepRow[];

  const provenanceGaps = [
    ...layups.flatMap((l) => {
      const reason = reasonFor(l.source_id);
      return reason ? [{ id: l.id, projectId: l.project_id, kind: "layup" as const, label: l.name, where: l.pd_projects?.name ?? "", reason }] : [];
    }),
    // Only steps that actually STATE a parameter — a step with no numbers has
    // nothing to defend, so flagging it would just train people to ignore this.
    ...stepRows.flatMap((s) => {
      const hasParam = s.temp_c_min != null || s.pressure_t_min != null || s.duration_min != null;
      if (!hasParam || !s.pd_processes) return [];
      const reason = reasonFor(s.source_id);
      return reason ? [{ id: s.id, projectId: s.pd_processes.project_id, kind: "step" as const, label: `${s.step_no}. ${s.title}`, where: s.pd_processes.name, reason }] : [];
    }),
  ].slice(0, 8);

  return NextResponse.json({
    world: "product-dev",
    counts: {
      projects: projects.count ?? 0,
      moldsInUse: molds.count ?? 0,
      layups: layups.length,
      plies: plyCount.count ?? 0,
    },
    recentLayups: layups.slice(0, 6).map((l) => ({
      id: l.id,
      projectId: l.project_id,
      name: l.name,
      ref: l.ref,
      project: l.pd_projects?.name ?? "",
      construction: l.pd_constructions?.name ?? null,
      mold: l.pd_molds?.name ?? null,
      updated_at: l.updated_at,
    })),
    provenanceGaps,
    stepsMissingPhotos: stepRows
      .filter((s) => s.pd_processes && (!Array.isArray(s.photos) || s.photos.length === 0))
      .slice(0, 6)
      .map((s) => ({ id: s.id, projectId: s.pd_processes!.project_id, label: `${s.step_no}. ${s.title}`, where: s.pd_processes!.name })),
  });
}
