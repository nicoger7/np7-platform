"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { makeNextTripCompare } from "@/lib/next-trip-order";

interface Experience {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  status: string;
  hero_image?: string | null;
  website_visible?: boolean | null;
}

interface Edition {
  experience_id: string;
  label?: string | null;
  date_start?: string | null;
  date_end?: string | null;
}

type ViewMode = "list" | "tile";

const VIEW_KEY = "np7-content-view";

// This page is about the public site, so the groups are named for what a status
// MEANS there rather than for the stored value.
const STATUS_LABEL: Record<string, string> = {
  published: "Live on the website",
  draft: "Draft",
  archived: "Archived",
  other: "Other",
};
const STATUS_ORDER = ["published", "draft", "archived"];

// Edition dates are date-only strings; parsed as local time they land a day
// early everywhere west of UTC, so pin both the parse and the format to UTC.
const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

function weekDates(ed: Edition): string {
  const s = String(ed.date_start).slice(0, 10);
  const e = ed.date_end ? String(ed.date_end).slice(0, 10) : null;
  if (!e) return fmtDay(s, { day: "numeric", month: "short", year: "numeric" });
  if (s.slice(0, 7) === e.slice(0, 7))
    return `${fmtDay(s, { day: "numeric" })}–${fmtDay(e, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${fmtDay(s, { day: "numeric", month: "short" })} – ${fmtDay(e, { day: "numeric", month: "short", year: "numeric" })}`;
}

function PinIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  );
}

function PhotoIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

/** Keeps the "Live on the website" heading honest for a deliberately hidden trip. */
function OffWebsiteBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] bg-amber-500/15 text-amber-500"
      title="Active, but not shown on the public website"
    >
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
      Off website
    </span>
  );
}

export default function ContentHubPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "tile";
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "tile";
    } catch {
      return "tile";
    }
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/experiences").then((r) => r.json()),
      // Editions carry the dates — "then by date" is the next trip's start.
      fetch("/api/admin/editions").then((r) => r.json()).catch(() => []),
    ])
      .then(([json, eds]) => {
        const list: Experience[] = Array.isArray(json)
          ? json
          : json.experiences ?? json.data ?? [];
        setExperiences(list);
        setEditions(Array.isArray(eds) ? eds : []);
      })
      .catch(() => setExperiences([]))
      .finally(() => setLoading(false));
  }, []);

  function setViewMode(mode: ViewMode) {
    setView(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      /* private mode — the choice just doesn't stick */
    }
  }

  // Same order as the Experiences overview — active first, then draft, then
  // archived, and inside each group by the next trip's date. Alphabetical put
  // unfinished drafts above the trips being sold.
  const rank = (st: string | null | undefined) => {
    const i = STATUS_ORDER.indexOf(String(st ?? "draft"));
    return i === -1 ? STATUS_ORDER.length : i;
  };
  const byNextTrip = makeNextTripCompare(editions);
  const filtered = experiences
    .filter(
      (e) =>
        e.title?.toLowerCase().includes(q.toLowerCase()) ||
        (e.location ?? "").toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => rank(a.status) - rank(b.status) || byNextTrip(a, b));

  const groups = [
    ...STATUS_ORDER.map((s) => ({ status: s, items: filtered.filter((e) => e.status === s) })),
    { status: "other", items: filtered.filter((e) => !STATUS_ORDER.includes(e.status)) },
  ].filter((g) => g.items.length > 0);

  // The soonest week that has not happened yet, per experience — plus who has
  // any dated week at all, so "all in the past" and "nothing planned" can say
  // different things.
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Map<string, Edition>();
  const everDated = new Set<string>();
  for (const ed of editions) {
    const d = ed.date_start ? String(ed.date_start).slice(0, 10) : null;
    if (!d) continue;
    everDated.add(ed.experience_id);
    if (d < today) continue;
    const cur = nextWeek.get(ed.experience_id);
    if (!cur || d < String(cur.date_start).slice(0, 10)) nextWeek.set(ed.experience_id, ed);
  }

  function GroupHeading({ status, count }: { status: string; count: number }) {
    return (
      <div className="flex items-center gap-2 mb-2 mt-6 first:mt-0">
        <h2 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase">{STATUS_LABEL[status] ?? status}</h2>
        <span className="text-[10px] admin-faint">({count})</span>
      </div>
    );
  }

  /** Location and the next week — the two things that identify a trip in text. */
  function Meta({ exp }: { exp: Experience }) {
    const next = nextWeek.get(exp.id);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1 admin-muted min-w-0">
          <PinIcon className="w-3.5 h-3.5 shrink-0 admin-faint" />
          <span className="truncate">{exp.location || "No location set"}</span>
        </span>
        <span className={`inline-flex items-center gap-1 ${next ? "admin-muted" : "admin-faint"}`}>
          <CalendarIcon className="w-3.5 h-3.5 shrink-0 admin-faint" />
          {next
            ? weekDates(next)
            : everDated.has(exp.id)
            ? "No upcoming week"
            : "No dates yet"}
        </span>
      </div>
    );
  }

  function Photo({ exp, tile }: { exp: Experience; tile: boolean }) {
    if (exp.hero_image) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={exp.hero_image}
          alt=""
          className={`w-full h-full object-cover ${tile ? "group-hover:scale-[1.03] transition-transform duration-300" : ""}`}
        />
      );
    }
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 admin-faint">
        <PhotoIcon className={tile ? "w-9 h-9" : "w-5 h-5"} />
        {tile && <span className="text-[11px] font-medium">No photo yet</span>}
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="mb-2">
        <h1 className="text-2xl font-bold admin-heading">Website Content</h1>
        <p className="text-sm admin-muted mt-1">
          Edit the public-page narrative for each experience — the spot, the week, the daily
          program and FAQ. Operational data (dates, packages, spots) stays on the experience itself.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-5 mb-6">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search experiences…"
          className="admin-input w-full sm:w-80 px-4 py-2.5 rounded-lg border text-sm outline-none"
        />

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden self-start" style={{ border: "1px solid var(--admin-border)" }}>
          <button
            onClick={() => setViewMode("list")}
            className="p-2 transition-colors"
            style={{
              backgroundColor: view === "list" ? "var(--admin-active)" : "transparent",
              color: view === "list" ? "var(--admin-text)" : "var(--admin-text-faint)",
            }}
            title="List view"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("tile")}
            className="p-2 transition-colors"
            style={{
              backgroundColor: view === "tile" ? "var(--admin-active)" : "transparent",
              color: view === "tile" ? "var(--admin-text)" : "var(--admin-text-faint)",
              borderLeft: "1px solid var(--admin-border)",
            }}
            title="Tile view"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm admin-faint">No experiences found.</p>
      ) : (
        groups.map((group) => (
          <div key={group.status}>
            <GroupHeading status={group.status} count={group.items.length} />

            {view === "tile" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {group.items.map((e) => (
                  <Link
                    key={e.id}
                    href={`/admin/content/${e.id}`}
                    className="group rounded-xl overflow-hidden admin-border border hover:border-[var(--admin-accent)] transition-colors"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden admin-surface">
                      <Photo exp={e} tile />
                      {e.status === "published" && e.website_visible === false && (
                        <span className="absolute top-2 right-2"><OffWebsiteBadge /></span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-semibold admin-heading leading-tight truncate mb-2">{e.title}</h3>
                      <Meta exp={e} />
                      <div className="flex items-center justify-end pt-3 mt-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0aa3c7] group-hover:gap-2.5 transition-all">
                          Edit content
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid gap-2.5">
                {group.items.map((e) => (
                  <Link
                    key={e.id}
                    href={`/admin/content/${e.id}`}
                    className="group flex items-center gap-4 admin-surface admin-border border rounded-xl px-4 py-3 hover:border-[var(--admin-accent)] transition-colors"
                  >
                    <div className="shrink-0 w-16 h-11 rounded-lg overflow-hidden admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
                      <Photo exp={e} tile={false} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold admin-heading truncate">{e.title}</span>
                        {e.status === "published" && e.website_visible === false && <OffWebsiteBadge />}
                      </div>
                      <Meta exp={e} />
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0aa3c7] group-hover:gap-2.5 transition-all">
                      Edit content
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
