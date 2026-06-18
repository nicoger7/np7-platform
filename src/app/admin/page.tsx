"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardData {
  counts: { experiences: number; bookings: number; contacts: number; upcomingEditions: number };
  latestBookings: { id: string; name: string | null; status: string | null; agreed_price: number | null; created_at: string; exp_experiences: { title: string } | null }[];
  upcomingEditions: { id: string; label: string | null; year: number | null; date_start: string | null; date_end: string | null; max_spots: number | null; spots_taken: number | null; exp_experiences: { title: string; slug: string } | null }[];
  recentEmails: { template_key: string; to_email: string | null; status: string | null; subject: string | null; sent_at: string | null; created_at: string }[];
  overdueTodos: number;
  finance: { openRevenue: number; unmatchedPayments: number };
}

function money(n: number | null | undefined) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "—";
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function StatCard({ label, value, href, accent }: { label: string; value: string | number; href?: string; accent?: boolean }) {
  const body = (
    <div
      className="rounded-xl p-5 h-full transition-colors"
      style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      onMouseEnter={(e) => href && (e.currentTarget.style.borderColor = "#0aa3c7")}
      onMouseLeave={(e) => href && (e.currentTarget.style.borderColor = "var(--admin-border)")}
    >
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-2" style={{ color: "var(--admin-text-faint)" }}>{label}</p>
      <p className="text-3xl font-black" style={{ color: accent ? "#0aa3c7" : "var(--admin-text)" }}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold admin-heading">{title}</h2>
        {href && <Link href={href} className="text-xs text-[#0aa3c7] hover:underline">View all →</Link>}
      </div>
      {children}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  paid: "text-green-400", attended: "text-green-400", confirmed: "text-blue-400",
  downpayment_paid: "text-blue-400", create_invoice: "text-amber-400",
  payment_pending: "text-amber-400", lost: "admin-faint", cancelled: "admin-faint",
};

export default function AdminDashboard() {
  const [d, setD] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard").then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, []);

  if (loading || !d) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading dashboard…</p></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold admin-heading mb-6">Dashboard</h1>

      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Experiences" value={d.counts.experiences} href="/admin/experiences" />
        <StatCard label="Bookings" value={d.counts.bookings} href="/admin/bookings" />
        <StatCard label="Contacts" value={d.counts.contacts} href="/admin/contacts" />
        <StatCard label="Upcoming editions" value={d.counts.upcomingEditions} accent />
      </div>

      {/* Finance strip (interim: visible to all team — role-gate per ROADMAP §8) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open revenue" value={money(d.finance.openRevenue)} href="/admin/payments" accent />
        <StatCard label="Unmatched payments" value={d.finance.unmatchedPayments} href="/admin/payments" />
        <StatCard label="Overdue to-dos" value={d.overdueTodos} href="/admin/todos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latest bookings */}
        <Panel title="Latest bookings" href="/admin/bookings">
          {d.latestBookings.length === 0 ? <p className="text-xs admin-faint">No bookings yet.</p> : (
            <div className="space-y-1.5">
              {d.latestBookings.map((b) => (
                <Link key={b.id} href={`/admin/bookings/${b.id}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{b.name || "Untitled"}</span>
                  <span className="admin-faint truncate hidden sm:block max-w-[120px]">{b.exp_experiences?.title || ""}</span>
                  <span className={`${STATUS_COLOR[b.status || ""] || "admin-muted"} w-24 text-right`}>{(b.status || "—").replace(/_/g, " ")}</span>
                  <span className="admin-muted w-16 text-right">{money(b.agreed_price)}</span>
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
                    <span className="flex-1 admin-heading truncate">{ed.exp_experiences?.title || "—"} <span className="admin-faint">· {ed.label || ed.year}</span></span>
                    <span className="admin-muted w-20 text-right">{fmtDate(ed.date_start)}</span>
                    <span className={`w-20 text-right ${left != null && left <= 2 ? "text-amber-400" : "admin-faint"}`}>{left != null ? `${left} left` : "—"}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Recent emails */}
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

        {/* Quick links / activity placeholder */}
        <Panel title="Quick actions">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "New booking", href: "/admin/bookings" },
              { label: "New experience", href: "/admin/experiences/new" },
              { label: "Payments", href: "/admin/payments" },
              { label: "Documents", href: "/admin/documents" },
              { label: "Pipeline rules", href: "/admin/pipeline-rules" },
              { label: "Guest reviews", href: "/admin/guest-reviews" },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="text-xs admin-muted hover:text-[#0aa3c7] py-2 px-3 rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
                {a.label}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
