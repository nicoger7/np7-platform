"use client";

import { useState, useEffect, useCallback } from "react";
import { deriveInsights, type Insight } from "@/lib/analytics-insights";

interface Analytics {
  funnel: { reserved: number; depositPaid: number; balancePaid: number };
  totals: { active: number; leads: number; lost: number; upcomingEditions: number };
  revenue: { received: number; expected: number; outstanding: number };
  editions: { id: string; title: string; label: string; date_start: string | null; max_spots: number; spots_taken: number; fill_pct: number | null; booked: number; received: number }[];
}

interface Behaviour {
  available: boolean;
  range: { days: number; from: string | null };
  totals: { pageviews: number; sessions: number; visitors: number; pagesPerSession: number; bounceRate: number; newPct: number };
  live: { activeVisitors: number; viewsToday: number; sessionsToday: number };
  members: { member: number; guest: number };
  series: { date: string; views: number }[];
  topPages: { path: string; views: number }[];
  entryPages: { path: string; sessions: number }[];
  exitPages: { path: string; sessions: number }[];
  topSources: { source: string; sessions: number }[];
  countries: { country: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  funnel: { expViews: number; reserveStart: number; register: number };
  behaviour?: {
    clicks: number; deadClicks: number; rageClicks: number;
    topClicked: { target: string; path: string; count: number }[];
    topDead: { target: string; path: string; count: number }[];
    topRage: { target: string; path: string; count: number }[];
  };
  experiences?: { slug: string; views: number; reserves: number; rate: number }[];
}

/** ISO-2 country code → flag emoji. */
function flag(cc: string) {
  if (!/^[A-Za-z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

const COUNTRY_NAMES: Record<string, string> = {
  DE: "Germany", AT: "Austria", CH: "Switzerland", NL: "Netherlands", GB: "United Kingdom",
  US: "United States", FR: "France", ES: "Spain", IT: "Italy", BE: "Belgium", DK: "Denmark",
  SE: "Sweden", NO: "Norway", PL: "Poland", TR: "Turkey",
};

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

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
    <h2 className="text-sm font-bold admin-heading mb-1">{title}</h2>
    {sub && <p className="text-xs admin-faint mb-4">{sub}</p>}
    {children}
  </div>
);

/** A ranked list of element targets (label + page + count) — the frustration/click reports. */
function TargetCard({ title, sub, rows, empty }: { title: string; sub: string; rows: { target: string; path: string; count: number }[]; empty: string }) {
  return (
    <Card title={title} sub={sub}>
      {rows.length === 0 ? <p className="text-xs admin-faint">{empty}</p> : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="admin-heading font-semibold truncate">{r.target}</p>
                <p className="admin-faint font-mono truncate">{r.path}</p>
              </div>
              <span className="admin-heading font-bold shrink-0">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const SEV_COLOR: Record<Insight["severity"], string> = { high: "#e5484d", medium: "#f5a623", low: "#0aa3c7" };
const AREA_BADGE: Record<Insight["area"], { background: string; color: string }> = {
  Website: { background: "rgba(10,163,199,0.12)", color: "#0aa3c7" },
  Experiences: { background: "rgba(16,110,86,0.14)", color: "#0f6e56" },
  Products: { background: "rgba(120,120,120,0.16)", color: "var(--admin-text)" },
};

/** One actionable insight row: severity dot · title · area badge · metric · action. */
function InsightRow({ it }: { it: Insight }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: "var(--admin-bg)" }}>
      <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SEV_COLOR[it.severity] }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold admin-heading">{it.title}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={AREA_BADGE[it.area]}>{it.area}</span>
          <span className="text-[11px] admin-faint">· {it.metric}</span>
        </div>
        <p className="text-xs admin-muted mt-1 leading-relaxed">{it.action}</p>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"business" | "behaviour">("business");

  return (
    <div>
      <h1 className="text-2xl font-bold admin-heading mb-1">Analytics</h1>
      <p className="text-sm admin-muted mb-5">How the business and the website are doing — all from your own data.</p>

      <div className="flex items-center gap-1 mb-6">
        {([["business", "Business"], ["behaviour", "Visitor behaviour"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${tab === k ? "text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)]" : "admin-muted"}`}
            style={tab === k ? undefined : { border: "1px solid var(--admin-border)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "business" ? <BusinessTab /> : <BehaviourTab />}
    </div>
  );
}

function BusinessTab() {
  const [d, setD] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics").then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, []);

  if (loading || !d) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;
  }

  const { funnel } = d;
  const stages = [
    { label: "Reserved", value: funnel.reserved, pct: 100 },
    { label: "Deposit paid", value: funnel.depositPaid, pct: funnel.reserved ? Math.round((funnel.depositPaid / funnel.reserved) * 100) : 0 },
    { label: "Balance paid", value: funnel.balancePaid, pct: funnel.reserved ? Math.round((funnel.balancePaid / funnel.reserved) * 100) : 0 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric label="Revenue received" value={money(d.revenue.received)} accent />
        <Metric label="Outstanding (owed)" value={money(d.revenue.outstanding)} />
        <Metric label="Active bookings" value={String(d.totals.active)} />
        <Metric label="Upcoming editions" value={String(d.totals.upcomingEditions)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Booking funnel" sub="Of everyone who reserved, how many secured and fully paid.">
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
        </Card>

        <Card title="Upcoming editions" sub="Fill rate & revenue per trip.">
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
        </Card>
      </div>
    </>
  );
}

function BehaviourTab() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Behaviour | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/analytics/behaviour?days=${days}`).then((r) => r.json()).then((data) => { setD(data); setLoading(false); });
  }, [days]);
  useEffect(() => { load(); }, [load]);

  if (loading || !d) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;
  }

  if (!d.available) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <p className="text-sm admin-heading font-bold mb-1">Visitor tracking isn&apos;t live yet</p>
        <p className="text-xs admin-faint max-w-md mx-auto">Apply migration <span className="font-mono">038_analytics_events</span> in Supabase. After that, first-party pageviews and the funnel (consent-gated, no third-party tools) will show up here.</p>
      </div>
    );
  }

  const maxViews = Math.max(1, ...d.series.map((s) => s.views));
  const funnelSteps = [
    { label: "Viewed a trip", value: d.funnel.expViews },
    { label: "Started reserving", value: d.funnel.reserveStart },
    { label: "Registered", value: d.funnel.register },
  ];
  const fTop = Math.max(1, d.funnel.expViews);
  const totalDeviceSessions = Math.max(1, d.devices.reduce((s, x) => s + x.sessions, 0));
  const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <p className="text-xs admin-faint">Consent-gated, first-party — only visitors who accept analytics are counted.</p>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${days === n ? "text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)]" : "admin-muted"}`} style={days === n ? undefined : { border: "1px solid var(--admin-border)" }}>
              {n}d
            </button>
          ))}
        </div>
      </div>

      {/* What to improve — the actionable layer, first thing you see. */}
      {(() => {
        const insights = deriveInsights(d);
        if (!insights.length) return null;
        return (
          <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
            <h2 className="text-sm font-bold admin-heading mb-1">What to improve</h2>
            <p className="text-xs admin-faint mb-4">Plain-English actions from the behaviour data, highest impact first — tagged by Website · Experiences · Products.</p>
            <div className="space-y-2.5">
              {insights.map((it) => <InsightRow key={it.id} it={it} />)}
            </div>
          </div>
        );
      })()}

      {/* Live / today */}
      <div className="rounded-xl p-4 mb-4 flex flex-wrap items-center gap-x-8 gap-y-2" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <span className="inline-flex items-center gap-2 text-[13px] font-bold admin-heading">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          {d.live.activeVisitors} active now
        </span>
        <span className="text-[13px] admin-muted">{d.live.viewsToday.toLocaleString("en-US")} views today</span>
        <span className="text-[13px] admin-muted">{d.live.sessionsToday.toLocaleString("en-US")} sessions today</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <Metric label="Visitors" value={d.totals.visitors.toLocaleString("en-US")} accent />
        <Metric label="Sessions" value={d.totals.sessions.toLocaleString("en-US")} />
        <Metric label="Pageviews" value={d.totals.pageviews.toLocaleString("en-US")} />
        <Metric label="Pages / session" value={String(d.totals.pagesPerSession)} />
        <Metric label="New visitors" value={`${d.totals.newPct}%`} />
        <Metric label="Bounce rate" value={`${d.totals.bounceRate}%`} />
      </div>

      {/* Daily views */}
      <div className="mb-4">
        <Card title="Pageviews per day" sub={`Last ${d.range.days} days`}>
          {d.totals.pageviews === 0 ? (
            <p className="text-xs admin-faint">No pageviews recorded in this window yet.</p>
          ) : (
            <div className="flex items-end gap-[3px] h-40">
              {d.series.map((s) => (
                <div key={s.date} className="flex-1 group relative flex flex-col justify-end h-full" title={`${dayLabel(s.date)}: ${s.views}`}>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(2, (s.views / maxViews) * 100)}%`, backgroundColor: "#0aa3c7" }} />
                </div>
              ))}
            </div>
          )}
          {d.series.length > 0 && (
            <div className="flex justify-between text-[10px] admin-faint mt-2">
              <span>{dayLabel(d.series[0].date)}</span>
              <span>{dayLabel(d.series[d.series.length - 1].date)}</span>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card title="Visitor → booking funnel" sub="Sessions that reached each step.">
          <div className="space-y-3">
            {funnelSteps.map((s) => {
              const pct = Math.round((s.value / fTop) * 100);
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="admin-muted font-medium">{s.label}</span>
                    <span className="admin-heading font-bold">{s.value} <span className="admin-faint font-normal">· {pct}%</span></span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#0aa3c7" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Devices */}
        <Card title="Devices" sub="Share of sessions by device.">
          {d.devices.length === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-3">
              {d.devices.map((x) => {
                const pct = Math.round((x.sessions / totalDeviceSessions) * 100);
                return (
                  <div key={x.device}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="admin-muted font-medium capitalize">{x.device}</span>
                      <span className="admin-heading font-bold">{x.sessions} <span className="admin-faint font-normal">· {pct}%</span></span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#0aa3c7" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top pages */}
        <Card title="Top pages" sub="Most-viewed pages.">
          {d.topPages.length === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-2">
              {d.topPages.map((p) => (
                <div key={p.path} className="flex items-center justify-between gap-3 text-xs">
                  <span className="admin-muted font-mono truncate">{p.path}</span>
                  <span className="admin-heading font-bold shrink-0">{p.views}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Top sources */}
        <Card title="Where visitors come from" sub="Sessions by referring site.">
          {d.topSources.length === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-2">
              {d.topSources.map((s) => (
                <div key={s.source} className="flex items-center justify-between gap-3 text-xs">
                  <span className="admin-muted truncate">{s.source}</span>
                  <span className="admin-heading font-bold shrink-0">{s.sessions}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Countries */}
        <Card title="Countries" sub="Sessions by visitor location (coarse, no IP stored).">
          {d.countries.length === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-2">
              {d.countries.map((c) => (
                <div key={c.country} className="flex items-center justify-between gap-3 text-xs">
                  <span className="admin-muted truncate">{flag(c.country)} {COUNTRY_NAMES[c.country] || c.country}</span>
                  <span className="admin-heading font-bold shrink-0">{c.sessions}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Member vs guest */}
        <Card title="Members vs guests" sub="Aggregate only — no individual is identified.">
          {d.members.member + d.members.guest === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-3">
              {([["Signed-in members", d.members.member], ["Guests", d.members.guest]] as const).map(([label, n]) => {
                const total = Math.max(1, d.members.member + d.members.guest);
                const pct = Math.round((n / total) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="admin-muted font-medium">{label}</span>
                      <span className="admin-heading font-bold">{n} <span className="admin-faint font-normal">· {pct}%</span></span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#0aa3c7" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Entry pages */}
        <Card title="Entry pages" sub="Where sessions begin.">
          {d.entryPages.length === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-2">
              {d.entryPages.map((p) => (
                <div key={p.path} className="flex items-center justify-between gap-3 text-xs">
                  <span className="admin-muted font-mono truncate">{p.path}</span>
                  <span className="admin-heading font-bold shrink-0">{p.sessions}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Exit pages */}
        <Card title="Exit pages" sub="Where sessions end — high-exit pages may be losing people.">
          {d.exitPages.length === 0 ? <p className="text-xs admin-faint">No data yet.</p> : (
            <div className="space-y-2">
              {d.exitPages.map((p) => (
                <div key={p.path} className="flex items-center justify-between gap-3 text-xs">
                  <span className="admin-muted font-mono truncate">{p.path}</span>
                  <span className="admin-heading font-bold shrink-0">{p.sessions}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Behaviour & frustration — what works, what doesn't, and where people get stuck. */}
      {d.behaviour && (d.behaviour.clicks + d.behaviour.deadClicks + d.behaviour.rageClicks > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-bold admin-heading mb-1">Behaviour &amp; frustration</h2>
          <p className="text-xs admin-faint mb-4">What visitors click — and where they click but nothing happens. First-party &amp; consent-gated, no third-party tools.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Metric label="Clicks tracked" value={d.behaviour.clicks.toLocaleString("en-US")} />
            <Metric label="Dead clicks" value={d.behaviour.deadClicks.toLocaleString("en-US")} accent />
            <Metric label="Rage clicks" value={d.behaviour.rageClicks.toLocaleString("en-US")} accent />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TargetCard title="Clicked but nothing happened" sub="Dead clicks — looked clickable, did nothing. Prime UX fixes." rows={d.behaviour.topDead} empty="No dead clicks recorded 🎉" />
            <TargetCard title="Rage clicks" sub="Frantic repeat-clicking — friction or a broken control." rows={d.behaviour.topRage} empty="No rage clicks recorded 🎉" />
            <TargetCard title="Most-clicked elements" sub="What visitors actually click." rows={d.behaviour.topClicked} empty="No clicks tracked yet." />
          </div>
        </div>
      )}
    </>
  );
}
