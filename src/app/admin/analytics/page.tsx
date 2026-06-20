"use client";

import { useState, useEffect } from "react";

interface Analytics {
  funnel: { reserved: number; depositPaid: number; balancePaid: number };
  totals: { active: number; leads: number; lost: number; upcomingEditions: number };
  revenue: { received: number; expected: number; outstanding: number };
  editions: { id: string; title: string; label: string; date_start: string | null; max_spots: number; spots_taken: number; fill_pct: number | null; booked: number; received: number }[];
}

function money(n: number | null | undefined) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "—";
}
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-2" style={{ color: "var(--admin-text-faint)" }}>{label}</p>
      <p className="text-3xl font-black" style={{ color: accent ? "#0aa3c7" : "var(--admin-text)" }}>{value}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [d, setD] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics").then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, []);

  if (loading || !d) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading analytics…</p></div>;
  }

  const { funnel } = d;
  const stages = [
    { label: "Reserved", value: funnel.reserved, pct: 100 },
    { label: "Deposit paid", value: funnel.depositPaid, pct: funnel.reserved ? Math.round((funnel.depositPaid / funnel.reserved) * 100) : 0 },
    { label: "Balance paid", value: funnel.balancePaid, pct: funnel.reserved ? Math.round((funnel.balancePaid / funnel.reserved) * 100) : 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold admin-heading mb-1">Analytics</h1>
      <p className="text-sm admin-muted mb-6">Your business at a glance — bookings, revenue and fill rates from live data.</p>

      {/* Revenue + counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric label="Revenue received" value={money(d.revenue.received)} accent />
        <Metric label="Outstanding (owed)" value={money(d.revenue.outstanding)} />
        <Metric label="Active bookings" value={String(d.totals.active)} />
        <Metric label="Upcoming editions" value={String(d.totals.upcomingEditions)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
          <h2 className="text-sm font-bold admin-heading mb-1">Booking funnel</h2>
          <p className="text-xs admin-faint mb-4">Of everyone who reserved, how many secured and fully paid.</p>
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="admin-muted font-medium">{s.label}</span>
                  <span className="admin-heading font-bold">{s.value} <span className="admin-faint font-normal">· {s.pct}%</span></span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                  <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: "#0aa3c7" }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] admin-faint mt-4">Expected revenue {money(d.revenue.expected)} · received {money(d.revenue.received)} · {d.totals.lost} lost/cancelled</p>
        </div>

        {/* Edition fill + revenue */}
        <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
          <h2 className="text-sm font-bold admin-heading mb-1">Upcoming editions</h2>
          <p className="text-xs admin-faint mb-4">Fill rate &amp; revenue per trip.</p>
          {d.editions.length === 0 ? (
            <p className="text-xs admin-faint">No upcoming editions.</p>
          ) : (
            <div className="space-y-3">
              {d.editions.map((e) => (
                <div key={e.id}>
                  <div className="flex items-center justify-between text-xs mb-1 gap-2">
                    <span className="admin-heading font-medium truncate">{e.title} <span className="admin-faint">· {e.label || fmtDate(e.date_start)}</span></span>
                    <span className="admin-muted shrink-0">{e.spots_taken}/{e.max_spots || "—"}{e.fill_pct != null ? ` · ${e.fill_pct}%` : ""}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, e.fill_pct ?? 0)}%`, backgroundColor: (e.fill_pct ?? 0) >= 100 ? "#22c55e" : "#0aa3c7" }} />
                  </div>
                  <p className="text-[11px] admin-faint mt-1">booked {money(e.booked)} · received {money(e.received)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
