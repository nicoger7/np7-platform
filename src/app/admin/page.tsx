"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BOOKING_STATUS_LABELS, normalizeBookingStatus } from "@/lib/types";
import { editionLabel } from "@/lib/edition-label";
import { useAdminEnv } from "./env-context";
import { MailGapsBanner } from "@/components/admin/mail-gaps-banner";

// Each admin world renders its OWN dashboard (Experience ops, Hardware catalog,
// Magazine editorial, Product Dev placeholder) — numbers never leak across
// worlds. The world comes from the shell's switcher via AdminEnvContext, so
// toggling worlds while on /admin swaps the dashboard in place.

function money(n: number | null | undefined) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "—";
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Privacy toggle (like a banking app) — mask the € figures. Persisted per-browser.
// Safe lazy init: window guard for SSR, and money only renders after the loading gate.
function useHideMoney(): [boolean, () => void] {
  const [hideMoney, setHideMoney] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("np7-admin-hide-money") === "1"; } catch { return false; }
  });
  function toggle() {
    setHideMoney((v) => { const n = !v; try { localStorage.setItem("np7-admin-hide-money", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  }
  return [hideMoney, toggle];
}

function MoneyEye({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={hidden ? "Show amounts" : "Hide amounts"}
      aria-pressed={hidden}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors admin-muted"
      style={{ border: "1px solid var(--admin-border)" }}
    >
      {hidden ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20" /></svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
      {hidden ? "Show €" : "Hide €"}
    </button>
  );
}

function DashboardHeader({ eye }: { eye?: { hidden: boolean; onToggle: () => void } }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold admin-heading">Dashboard</h1>
      {/* Privacy eye only for roles that can see money at all — for restricted
          roles there are no € figures on the page, and even showing the toggle
          (or masked ••••) would advertise that something is being hidden. */}
      {eye && <MoneyEye hidden={eye.hidden} onToggle={eye.onToggle} />}
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading dashboard…</p></div>;
}

// Accent follows the active world (Experience cyan / Hardware lime / Magazine
// amber) via the shell's --admin-accent, so every world's dashboard is branded.
function StatCard({ label, value, href, accent }: { label: string; value: string | number; href?: string; accent?: boolean }) {
  const body = (
    <div
      className="rounded-xl p-5 h-full transition-colors"
      style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      onMouseEnter={(e) => href && (e.currentTarget.style.borderColor = "var(--admin-accent)")}
      onMouseLeave={(e) => href && (e.currentTarget.style.borderColor = "var(--admin-border)")}
    >
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-2" style={{ color: "var(--admin-text-faint)" }}>{label}</p>
      <p className="text-3xl font-black" style={{ color: accent ? "var(--admin-accent)" : "var(--admin-text)" }}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Panel({ title, href, linkLabel, subtitle, children }: { title: string; href?: string; linkLabel?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h2 className="text-sm font-bold admin-heading">{title}</h2>
        {href && <Link href={href} className="text-xs hover:underline" style={{ color: "var(--admin-accent)" }}>{linkLabel ?? "View all"} →</Link>}
      </div>
      {subtitle && <p className="text-[11px] admin-faint -mt-1.5 mb-2.5">{subtitle}</p>}
      {children}
    </div>
  );
}

function QuickActions({ actions }: { actions: { label: string; href: string }[] }) {
  return (
    <Panel title="Quick actions">
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="text-xs admin-muted hover:text-[var(--admin-accent)] py-2 px-3 rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
            {a.label}
          </Link>
        ))}
      </div>
    </Panel>
  );
}

// ─── World dispatcher ────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const env = useAdminEnv();
  if (env === "hardware") return <HardwareDashboard />;
  if (env === "magazine") return <MagazineDashboard />;
  if (env === "product-dev") return <ProductDevDashboard />;
  return <ExperienceDashboard />;
}

// ─── NP7 Hardware ────────────────────────────────────────────────────────────

interface HardwareData {
  counts: { products: number; published: number; drafts: number; stockUnits: number; openPos: number; openOrders: number };
  finance: { inventoryValue: number } | null;
  inboundPipeline: { id: string; poNumber: string; status: string; expected: string | null; supplier: string | null; units: number; received: number }[];
  latestOrders: { id: string; number: number; email: string; status: string; paymentStatus: string; fulfillmentStatus: string; total: number | null; placedAt: string }[];
  latestProducts: { id: string; name: string; category: string | null; status: string | null; price: number | null; updated_at: string | null; created_at: string | null }[];
  contentGaps: { productId: string; name: string; missing: string[] }[];
  slim?: boolean;
}

const PO_DASH_COLOR: Record<string, string> = {
  issued: "text-blue-400", confirmed: "text-blue-400", in_production: "text-amber-500",
  ready_to_ship: "text-amber-500", shipped: "text-purple-400", partially_received: "text-green-400",
};

const HW_STATUS_COLOR: Record<string, string> = {
  published: "text-green-400", draft: "text-amber-400", archived: "admin-faint",
};

function HardwareDashboard() {
  const [d, setD] = useState<HardwareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideMoney, toggleHideMoney] = useHideMoney();

  useEffect(() => {
    fetch("/api/admin/dashboard?world=hardware").then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, []);

  if (loading || !d) return <Loading />;

  const slim = !!d.slim;
  const amt = (n: number | null | undefined) => (hideMoney ? "€ ••••" : money(n));

  return (
    <div>
      <DashboardHeader eye={slim ? undefined : { hidden: hideMoney, onToggle: toggleHideMoney }} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Products" value={d.counts.products} href="/admin/products" />
        <StatCard label="On website" value={d.counts.published} href="/admin/products?status=published" />
        <StatCard label="Drafts" value={d.counts.drafts} href="/admin/products?status=draft" />
        <StatCard label="Stock units" value={d.counts.stockUnits} href="/admin/inventory" accent />
      </div>

      {!slim && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {d.finance && <StatCard label="Inventory value (landed)" value={amt(Math.round(d.finance.inventoryValue))} href="/admin/inventory" accent />}
          <StatCard label="Open orders" value={d.counts.openOrders} href="/admin/orders" accent={d.counts.openOrders > 0} />
          <StatCard label="Open POs" value={d.counts.openPos} href="/admin/purchasing" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inbound pipeline — what lands when */}
        <Panel title={`Inbound pipeline${d.inboundPipeline.length ? ` (${d.inboundPipeline.length})` : ""}`} href="/admin/purchasing">
          {d.inboundPipeline.length === 0 ? <p className="text-xs admin-faint">No open purchase orders.</p> : (
            <div className="space-y-1.5">
              {d.inboundPipeline.map((po) => (
                <Link key={po.id} href={`/admin/purchasing/${po.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="font-mono admin-heading">{po.poNumber}</span>
                  <span className="flex-1 admin-faint truncate">{po.supplier ?? ""}</span>
                  <span className={`${PO_DASH_COLOR[po.status] ?? "admin-muted"} capitalize`}>{po.status.replace(/_/g, " ")}</span>
                  <span className="admin-muted w-14 text-right">{po.received}/{po.units}</span>
                  <span className="admin-faint w-16 text-right">{fmtDate(po.expected)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Latest products" href="/admin/products">
          {d.latestProducts.length === 0 ? <p className="text-xs admin-faint">No products yet.</p> : (
            <div className="space-y-1.5">
              {d.latestProducts.map((p) => (
                <Link key={p.id} href={`/admin/products/${p.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{p.name}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[120px]">{p.category || ""}</span>
                  <span className={`${HW_STATUS_COLOR[p.status ?? "draft"] || "admin-muted"} w-20 text-right`}>{p.status ?? "draft"}</span>
                  {!slim && <span className="admin-muted w-16 text-right">{amt(p.price)}</span>}
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={`Website content missing${d.contentGaps.length ? ` (${d.contentGaps.length})` : ""}`} href="/admin/product-pages">
          {d.contentGaps.length === 0 ? <p className="text-xs admin-faint">Every published product has a hero, gallery &amp; overview. 🎉</p> : (
            <div className="space-y-1.5">
              {d.contentGaps.map((c) => (
                <Link key={c.productId} href={`/admin/product-pages/${c.productId}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{c.name}</span>
                  <span className="shrink-0 admin-faint">missing {c.missing.join(" + ")}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Latest orders" href="/admin/orders">
          {d.latestOrders.length === 0 ? <p className="text-xs admin-faint">No orders yet — web checkout is the next build step.</p> : (
            <div className="space-y-1.5">
              {d.latestOrders.map((o) => (
                <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="font-mono admin-heading">#{o.number}</span>
                  <span className="flex-1 admin-faint truncate">{o.email}</span>
                  <span className={`${o.paymentStatus === "paid" ? "text-green-400" : o.paymentStatus === "awaiting" ? "text-amber-500" : "admin-muted"}`}>{o.paymentStatus.replace(/_/g, " ")}</span>
                  {!slim && <span className="admin-muted w-16 text-right">{o.total != null ? (hideMoney ? "€ ••••" : `€${(o.total / 100).toLocaleString()}`) : "—"}</span>}
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <QuickActions actions={[
          { label: "Product pages", href: "/admin/product-pages" },
          { label: "Products", href: "/admin/products" },
          { label: "Inventory", href: "/admin/inventory" },
          { label: "Purchasing", href: "/admin/purchasing" },
          { label: "Suppliers", href: "/admin/suppliers" },
          { label: "Orders", href: "/admin/orders" },
        ]} />
      </div>
    </div>
  );
}

// ─── Magazine ────────────────────────────────────────────────────────────────

interface MagazineData {
  counts: { posts: number; published: number; drafts: number; destinations: number };
  latestPosts: { id: string; title: string; status: string | null; category: string | null; published_at: string | null; updated_at: string | null }[];
}

function MagazineDashboard() {
  const [d, setD] = useState<MagazineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard?world=magazine").then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, []);

  if (loading || !d) return <Loading />;

  return (
    <div>
      <DashboardHeader />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Posts" value={d.counts.posts} href="/admin/blog" />
        <StatCard label="Published" value={d.counts.published} accent />
        <StatCard label="Drafts" value={d.counts.drafts} href="/admin/blog" />
        <StatCard label="Destinations" value={d.counts.destinations} href="/admin/destinations" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Latest posts" href="/admin/blog">
          {d.latestPosts.length === 0 ? <p className="text-xs admin-faint">No posts yet.</p> : (
            <div className="space-y-1.5">
              {d.latestPosts.map((p) => (
                <Link key={p.id} href={`/admin/blog/${p.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{p.title}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[100px]">{p.category || ""}</span>
                  <span className={`${p.status === "published" ? "text-green-400" : "text-amber-400"} w-20 text-right`}>{p.status ?? "draft"}</span>
                  <span className="admin-faint w-12 text-right">{fmtDate(p.published_at || p.updated_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <QuickActions actions={[
          { label: "Magazine", href: "/admin/blog" },
          { label: "Spotguide", href: "/admin/spotguide" },
          { label: "Destinations", href: "/admin/destinations" },
        ]} />
      </div>
    </div>
  );
}

// ─── Product Development ─────────────────────────────────────────────────────

interface ProductDevData {
  counts: { projects: number; moldsInUse: number; layups: number; plies: number };
  recentLayups: { id: string; projectId: string; name: string; ref: string | null; project: string; construction: string | null; mold: string | null; updated_at: string }[];
  /** Parameter-bearing rows with no citation, or one older than a year. This is
   *  the panel that stops provenance decaying into an optional field. */
  provenanceGaps: { id: string; projectId: string; kind: "layup" | "step"; label: string; where: string; reason: "missing" | "stale" }[];
  stepsMissingPhotos: { id: string; projectId: string; label: string; where: string }[];
  slim?: boolean;
}

function ProductDevDashboard() {
  const [d, setD] = useState<ProductDevData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard?world=product-dev")
      .then((r) => r.json())
      .then((data) => { setD(data?.error ? null : data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm admin-muted">Loading…</div>;

  const c = d?.counts;
  return (
    <div>
      <DashboardHeader />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Projects" value={c?.projects ?? 0} href="/admin/product-dev/projects" />
        <StatCard label="Molds in use" value={c?.moldsInUse ?? 0} />
        <StatCard label="Build sheets" value={c?.layups ?? 0} />
        <StatCard label="Plies on file" value={c?.plies ?? 0} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Recently changed build sheets" href="/admin/product-dev/projects">
          {!d?.recentLayups?.length ? <p className="text-xs admin-faint">Nothing yet — start a project and add a layup.</p> : (
            <div className="space-y-1.5">
              {d.recentLayups.map((l) => (
                <Link key={l.id} href={`/admin/product-dev/projects/${l.projectId}?tab=layups&layup=${l.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{l.name}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[120px]">{[l.construction, l.mold].filter(Boolean).join(" · ")}</span>
                  <span className="admin-faint w-16 text-right">{fmtDate(l.updated_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Parameters with no source"
          subtitle="A cure temperature nobody can trace is a number you cannot defend in a quote."
        >
          {!d?.provenanceGaps?.length ? <p className="text-xs admin-faint">Everything is cited and current.</p> : (
            <div className="space-y-1.5">
              {d.provenanceGaps.map((g) => (
                <Link key={`${g.kind}-${g.id}`} href={`/admin/product-dev/projects/${g.projectId}?tab=${g.kind === "layup" ? "layups" : "process"}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{g.label}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[100px]">{g.where}</span>
                  <span className={g.reason === "missing" ? "text-red-400 w-14 text-right" : "text-amber-400 w-14 text-right"}>
                    {g.reason === "missing" ? "no source" : "stale"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Steps without photos">
          {!d?.stepsMissingPhotos?.length ? <p className="text-xs admin-faint">Every step has a reference photo.</p> : (
            <div className="space-y-1.5">
              {d.stepsMissingPhotos.map((s) => (
                <Link key={s.id} href={`/admin/product-dev/projects/${s.projectId}?tab=process`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{s.label}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[140px]">{s.where}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <QuickActions actions={[
          { label: "Projects", href: "/admin/product-dev/projects" },
          { label: "Media", href: "/admin/product-dev/library" },
        ]} />
      </div>
    </div>
  );
}

// ─── NP7 Experience ──────────────────────────────────────────────────────────

interface DashboardData {
  counts: { experiences: number; bookings: number; contacts: number; upcomingEditions: number };
  latestBookings: { id: string; name: string | null; status: string | null; agreed_price: number | null; created_at: string; exp_experiences: { title: string } | null }[];
  upcomingEditions: { id: string; label: string | null; year: number | null; date_start: string | null; date_end: string | null; max_spots: number | null; spots_taken: number | null; exp_experiences: { title: string; slug: string } | null }[];
  recentEmails: { template_key: string; to_email: string | null; status: string | null; subject: string | null; sent_at: string | null; created_at: string }[];
  overdueTodos: number;
  finance: { openRevenue: number; unmatchedPayments: number } | null;
  pendingAddons: { id: string; bookingId: string; label: string; price: number | null; bookingName: string; payDirect?: boolean }[];
  slim?: boolean;
  photoTasks?: { editionId: string; label: string; total: number; missing: { id: string; name: string }[] }[];
  contentGaps?: { experienceId: string; title: string; missing: string[] }[];
  upcomingMails?: {
    paused: boolean;
    mails: { templateKey: string; label: string; editionId: string; editionTitle: string; sendDate: string; daysAway: number; recipients: number; missing: string[] }[];
  };
  readiness?: {
    id: string; title: string; slug: string | null; websiteVisible: boolean; published: boolean;
    nextStart: string | null;
    missing: { label: string; where: string }[];
    generic: { label: string; where: string }[];
    done: number; total: number;
  }[];
}

const STATUS_COLOR: Record<string, string> = {
  paid: "text-green-400", attended: "text-green-400", confirmed: "text-blue-400",
  reserved: "text-amber-400", lead: "admin-muted", lost: "admin-faint",
};

function ExperienceDashboard() {
  const [d, setD] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideMoney, toggleHideMoney] = useHideMoney();
  const [confirming, setConfirming] = useState<string | null>(null);

  /**
   * Confirm an add-on without leaving the dashboard.
   *
   * Asks first, because this is one click away from a row you were only
   * glancing at — and it tells you exactly what it will do, since the two
   * outcomes differ: a normal add-on gets charged, a pay-direct one is arranged
   * and never invoiced. Same rule as the booking page; disagreeing here would
   * bill a guest for money we never collect.
   */
  async function quickConfirmAddon(a: { id: string; bookingId: string; label: string; bookingName: string; price: number | null; payDirect?: boolean }) {
    const what = a.payDirect
      ? `Confirm "${a.label}" for ${a.bookingName}?\n\nThey pay the supplier directly — nothing will be invoiced.`
      : `Confirm "${a.label}" for ${a.bookingName}?\n\nThis adds ${a.price ? `€${Number(a.price).toLocaleString("en-US")}` : "its price"} to what they owe.`;
    if (!window.confirm(what)) return;
    setConfirming(a.id);
    try {
      const res = await fetch(`/api/admin/bookings/${a.bookingId}/addons`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_id: a.id, status: "confirmed", complimentary: !!a.payDirect }),
      });
      if (res.ok) {
        setD((prev) => prev ? { ...prev, pendingAddons: prev.pendingAddons.filter((x) => x.id !== a.id) } : prev);
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Couldn't confirm that add-on.");
      }
    } finally { setConfirming(null); }
  }

  useEffect(() => {
    fetch("/api/admin/dashboard").then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, []);

  if (loading || !d) return <Loading />;

  // Mask money everywhere on the dashboard when the eye is toggled off.
  const amt = (n: number | null | undefined) => (hideMoney ? "€ ••••" : money(n));

  const photoTasks = d.photoTasks ?? [];
  const contentGaps = d.contentGaps ?? [];
  const slim = !!d.slim;

  const photoPanels = (
    <>
      {(photoTasks.length > 0 || slim) && (
        <Panel title={`Participant photos to upload${photoTasks.length ? ` (${photoTasks.length})` : ""}`} href="/admin/images">
          {photoTasks.length === 0 ? <p className="text-xs admin-faint">Every started trip has participant photos. 🎉</p> : (
            <div className="space-y-3">
              {photoTasks.map((t) => (
                <Link key={t.editionId} href={`/admin/editions/${t.editionId}?tab=memories`} className="block py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold admin-heading truncate">{t.label}</span>
                    <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">{t.total} missing</span>
                  </div>
                  <p className="text-[11px] admin-faint mt-1 leading-relaxed">{t.missing.map((m) => m.name).join(", ")}{t.total > t.missing.length ? ` +${t.total - t.missing.length} more` : ""}</p>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      )}
      {(contentGaps.length > 0 || slim) && (
        <Panel title={`Website photos missing${contentGaps.length ? ` (${contentGaps.length})` : ""}`} href="/admin/content">
          {contentGaps.length === 0 ? <p className="text-xs admin-faint">Every on-website experience has a hero &amp; gallery. 🎉</p> : (
            <div className="space-y-1.5">
              {contentGaps.map((c) => (
                <Link key={c.experienceId} href={`/admin/content/${c.experienceId}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{c.title}</span>
                  <span className="shrink-0 admin-faint">missing {c.missing.join(" + ")}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  );

  return (
    <div>
      <DashboardHeader eye={slim ? undefined : { hidden: hideMoney, onToggle: toggleHideMoney }} />

      {/* Trips whose scheduled mails are being held back for missing content.
          Renders nothing when there is nothing to say. */}
      <MailGapsBanner />

      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Experiences" value={d.counts.experiences} href="/admin/experiences" />
        <StatCard label="Bookings" value={d.counts.bookings} href="/admin/bookings" />
        <StatCard label="Contacts" value={d.counts.contacts} href="/admin/contacts" />
        <StatCard label="Upcoming editions" value={d.counts.upcomingEditions} accent />
      </div>

      {/* Finance + ops cards — hidden for restricted (no-money) roles. */}
      {!slim && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {d.finance && <StatCard label="Open revenue" value={amt(d.finance.openRevenue)} href="/admin/payments" accent />}
          {d.finance && <StatCard label="Unmatched payments" value={d.finance.unmatchedPayments} href="/admin/payments" />}
          <StatCard label="Overdue to-dos" value={d.overdueTodos} href="/admin/todos" />
          <StatCard label="Pending add-ons" value={d.pendingAddons.length} accent={d.pendingAddons.length > 0} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Photo tasks — shown first for restricted roles (their main job). */}
        {slim && photoPanels}

        {/* Pending add-ons to confirm */}
        {!slim && (
        <Panel title={`Pending add-ons${d.pendingAddons.length ? ` (${d.pendingAddons.length})` : ""}`}>
          {d.pendingAddons.length === 0 ? <p className="text-xs admin-faint">No add-on requests waiting.</p> : (
            <div className="space-y-1.5">
              {d.pendingAddons.map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <Link href={`/admin/bookings/${a.bookingId}?tab=addons`} className="flex-1 min-w-0 admin-heading truncate">
                    {a.bookingName} <span className="admin-faint">· {a.label}</span>
                  </Link>
                  {a.payDirect
                    ? <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500" title="The guest pays the supplier — nothing is invoiced">Pays supplier</span>
                    : <span className="admin-muted w-14 text-right shrink-0">{amt(a.price)}</span>}
                  <button
                    onClick={() => quickConfirmAddon(a)}
                    disabled={confirming === a.id}
                    className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 transition-colors"
                  >
                    {confirming === a.id ? "…" : "Confirm"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
        )}

        {/* Before it goes public — what still needs writing. Only experiences
            with a trip coming up or already on the website: a checklist that
            includes every idle draft is a checklist nobody reads. */}
        {!slim && (() => {
          const relevant = (d.readiness ?? []).filter((r) => r.nextStart || r.websiteVisible);
          const todo = relevant.filter((r) => r.missing.length || r.generic.length);
          return (
            <Panel
              title={`Before it goes public${todo.length ? ` (${todo.length})` : ""}`}
              href="/admin/content"
              linkLabel="Website content"
              subtitle="The number on the right is how many of the 11 checks each experience passes."
            >
              {!relevant.length ? (
                <p className="text-xs admin-faint">No experiences on the website or with a trip coming up.</p>
              ) : !todo.length ? (
                <p className="text-xs text-green-500">Every live experience has its own copy. Nothing generic left.</p>
              ) : (
                <div className="space-y-2">
                  {todo.slice(0, 5).map((r) => (
                    <Link key={r.id} href={`/admin/content/${r.id}`}
                      className="block text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 admin-heading truncate">{r.title}</span>
                        <span className="shrink-0 admin-faint" title={`${r.done} of ${r.total} checks done — ${r.missing.length} to write, ${r.generic.length} still generic`}>{r.done}/{r.total}</span>
                      </span>
                      <span className="block admin-muted mt-0.5 leading-relaxed">
                        {r.missing.length > 0 && <span>{r.missing.length} to write: {r.missing.slice(0, 3).map((m) => m.label).join(", ")}{r.missing.length > 3 ? "…" : ""}</span>}
                        {r.missing.length > 0 && r.generic.length > 0 && <span className="admin-faint"> · </span>}
                        {r.generic.length > 0 && <span className="text-amber-500">{r.generic.length} still generic: {r.generic.slice(0, 2).map((g) => g.label).join(", ")}{r.generic.length > 2 ? "…" : ""}</span>}
                      </span>
                    </Link>
                  ))}
                  {todo.length > 5 && <p className="text-[11px] admin-faint pt-0.5">+{todo.length - 5} more</p>}
                </div>
              )}
            </Panel>
          );
        })()}

        {/* Mails going out soon — the scheduled ones nobody triggers, so the
            only way to catch a problem is to see it before the send date. */}
        {!slim && (
        <Panel title={`Mails going out soon${d.upcomingMails?.mails.length ? ` (${d.upcomingMails.mails.length})` : ""}`} href="/admin/emails">
          {d.upcomingMails?.paused && (
            <p className="text-[11px] text-amber-500 mb-2">Lifecycle is paused — these are what <em>would</em> go out once you switch it on.</p>
          )}
          {!d.upcomingMails?.mails.length ? (
            <p className="text-xs admin-faint">Nothing scheduled in the next 45 days.</p>
          ) : (
            <div className="space-y-1.5">
              {d.upcomingMails.mails.slice(0, 8).map((m) => (
                <Link key={`${m.editionId}:${m.templateKey}`} href={`/admin/editions/${m.editionId}?tab=branding`}
                  className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className={`shrink-0 w-14 text-right font-bold ${m.daysAway <= 3 ? "text-amber-500" : "admin-muted"}`}>
                    {m.daysAway === 0 ? "today" : `${m.daysAway}d`}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block admin-heading truncate">{m.label}</span>
                    <span className="block admin-faint truncate">{m.editionTitle}</span>
                  </span>
                  {m.missing.length > 0 ? (
                    <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">Will be held</span>
                  ) : (
                    <span className="shrink-0 admin-muted">{m.recipients}&nbsp;guest{m.recipients === 1 ? "" : "s"}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Panel>
        )}

        {/* Latest bookings — names + status (prices already redacted for restricted roles) */}
        <Panel title="Latest bookings" href="/admin/bookings">
          {d.latestBookings.length === 0 ? <p className="text-xs admin-faint">No bookings yet.</p> : (
            <div className="space-y-1.5">
              {d.latestBookings.map((b) => (
                <Link key={b.id} href={`/admin/bookings/${b.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{b.name || "Untitled"}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[120px]">{b.exp_experiences?.title || ""}</span>
                  <span className={`${STATUS_COLOR[normalizeBookingStatus(b.status)] || "admin-muted"} w-24 text-right`}>{BOOKING_STATUS_LABELS[normalizeBookingStatus(b.status)]}</span>
                  {/* price slot only for money-visible roles — an empty (or masked)
                      column just advertises what's being withheld */}
                  {!slim && <span className="admin-muted w-16 text-right">{amt(b.agreed_price)}</span>}
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {/* Upcoming editions */}
        <Panel title="Upcoming editions" href="/admin/experiences">
          {d.upcomingEditions.length === 0 ? <p className="text-xs admin-faint">No upcoming editions.</p> : (
            <div className="space-y-1.5">
              {d.upcomingEditions.map((ed) => {
                const left = ed.max_spots != null ? ed.max_spots - (ed.spots_taken ?? 0) : null;
                return (
                  <Link key={ed.id} href={`/admin/editions/${ed.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                    <span className="flex-1 admin-heading truncate">{ed.exp_experiences?.title || "—"} <span className="admin-faint">· {editionLabel(ed)}</span></span>
                    <span className="admin-muted w-20 text-right">{fmtDate(ed.date_start)}</span>
                    <span className={`w-20 text-right ${left != null && left <= 2 ? "text-amber-400" : "admin-faint"}`}>{left != null ? `${left} left` : "—"}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Photo tasks for full-access roles too (when there's outstanding work). */}
        {!slim && photoPanels}

        {/* Recent emails — hidden for restricted roles (recipient addresses). */}
        {!slim && (
        <Panel title="Recent emails" href="/admin/email-log">
          {d.recentEmails.length === 0 ? <p className="text-xs admin-faint">No emails sent.</p> : (
            <div className="space-y-1.5">
              {d.recentEmails.map((e, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5">
                  <span className="flex-1 admin-muted truncate">{(e.template_key || "").replace(/_/g, " ")}</span>
                  <span className="admin-faint truncate max-w-[140px] hidden sm:block">{e.to_email}</span>
                  <span className={`w-16 text-right ${e.status === "sent" ? "text-green-400" : e.status === "failed" ? "text-red-400" : "admin-faint"}`}>{e.status}</span>
                  <span className="admin-faint w-12 text-right">{fmtDate(e.sent_at || e.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        )}

        {/* Quick links — full-access roles only (most targets are gated). */}
        {!slim && (
        <QuickActions actions={[
          { label: "New booking", href: "/admin/bookings" },
          { label: "New experience", href: "/admin/experiences/new" },
          { label: "Payments", href: "/admin/payments" },
          { label: "Documents", href: "/admin/documents" },
          { label: "Pipeline rules", href: "/admin/pipeline-rules" },
          { label: "Guest reviews", href: "/admin/guest-reviews" },
        ]} />
        )}
      </div>
    </div>
  );
}
