"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BOOKING_STATUS_LABELS, normalizeBookingStatus } from "@/lib/types";
import { editionLabel } from "@/lib/edition-label";
import { useAdminEnv } from "./env-context";

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

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h2 className="text-sm font-bold admin-heading">{title}</h2>
        {href && <Link href={href} className="text-xs hover:underline" style={{ color: "var(--admin-accent)" }}>View all →</Link>}
      </div>
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
  counts: { products: number; published: number; drafts: number; stockUnits: number };
  latestProducts: { id: string; name: string; category: string | null; status: string | null; price: number | null; updated_at: string | null; created_at: string | null }[];
  contentGaps: { productId: string; name: string; missing: string[] }[];
  slim?: boolean;
}

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Products" value={d.counts.products} href="/admin/products" />
        <StatCard label="On website" value={d.counts.published} href="/admin/products?status=published" />
        <StatCard label="Drafts" value={d.counts.drafts} href="/admin/products?status=draft" />
        <StatCard label="Stock units" value={d.counts.stockUnits} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <Panel title={`Website content missing${d.contentGaps.length ? ` (${d.contentGaps.length})` : ""}`} href="/admin/products">
          {d.contentGaps.length === 0 ? <p className="text-xs admin-faint">Every published product has a hero, gallery &amp; overview. 🎉</p> : (
            <div className="space-y-1.5">
              {d.contentGaps.map((c) => (
                <Link key={c.productId} href={`/admin/products/${c.productId}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{c.name}</span>
                  <span className="shrink-0 admin-faint">missing {c.missing.join(" + ")}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Orders" href="/admin/orders">
          <p className="text-xs admin-faint leading-relaxed">
            The shop backend is in the works — once it ships, open orders, fulfillment status and
            revenue land here.
          </p>
        </Panel>

        <QuickActions actions={[
          { label: "Products", href: "/admin/products" },
          { label: "Orders", href: "/admin/orders" },
          { label: "File storage", href: "/admin/images" },
          { label: "Archive", href: "/admin/archive" },
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

function ProductDevDashboard() {
  return (
    <div>
      <DashboardHeader />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Product development">
          <p className="text-xs admin-faint leading-relaxed mb-3">
            Boards and Reviews are in the works — prototypes, test feedback and review rounds will
            live here.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[{ label: "Boards", href: "/admin/boards" }, { label: "Reviews", href: "/admin/reviews" }].map((a) => (
              <Link key={a.href} href={a.href} className="text-xs admin-muted hover:text-[var(--admin-accent)] py-2 px-3 rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
                {a.label}
              </Link>
            ))}
          </div>
        </Panel>
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
  pendingAddons: { id: string; bookingId: string; label: string; price: number | null; bookingName: string }[];
  slim?: boolean;
  photoTasks?: { editionId: string; label: string; total: number; missing: { id: string; name: string }[] }[];
  contentGaps?: { experienceId: string; title: string; missing: string[] }[];
}

const STATUS_COLOR: Record<string, string> = {
  paid: "text-green-400", attended: "text-green-400", confirmed: "text-blue-400",
  reserved: "text-amber-400", lead: "admin-muted", lost: "admin-faint",
};

function ExperienceDashboard() {
  const [d, setD] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideMoney, toggleHideMoney] = useHideMoney();

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
                <Link key={a.id} href={`/admin/bookings/${a.bookingId}?tab=addons`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{a.bookingName} <span className="admin-faint">· {a.label}</span></span>
                  <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">Requested</span>
                  <span className="admin-muted w-16 text-right">{amt(a.price)}</span>
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
