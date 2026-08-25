"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { makeNextTripCompare } from "@/lib/next-trip-order";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { BrandedTile } from "@/components/experience/branded-tile";
import { placeFromLocation, flagFromLocation } from "@/lib/experience-tile";

interface Experience {
  id: string;
  title: string;
  slug: string;
  location: string;
  status: string;
  hero_image: string;
  hotel: string | null;
  website_visible?: boolean | null;
  tile_auto?: boolean | null;
}

// "published" is the stored value for an operationally-active experience.
const STATUS_LABEL: Record<string, string> = { published: "Active", draft: "Draft", archived: "Archived" };

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  status: string;
  label?: string | null;
  date_start?: string | null;
}

type ViewMode = "list" | "tile";
type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "title", label: "Title", width: "1fr", required: true },
  { key: "location", label: "Location", width: "140px" },
  { key: "hotel", label: "Hotel", width: "100px" },
  { key: "editions", label: "Editions", width: "160px" },
  { key: "status", label: "Status", width: "90px" },
];

const STORAGE_KEY = "np7-exp-columns";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
        status === "published"
          ? "bg-green-500/15 text-green-400"
          : status === "archived"
          ? "bg-red-500/15 text-red-400"
          : "admin-surface admin-muted"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Shown when an active experience is intentionally kept off the public site. */
function OffWebsiteBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] bg-amber-500/15 text-amber-500" title="Active, but not shown on the public website">
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      Off website
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What a chip says when several editions share a year.
 *
 * Bonaire runs three weeks each December, so three identical "2026" chips told
 * you nothing — you had to hover each one to find the week you wanted. Hovering
 * is the tell that the label is wrong, so make the label carry the difference
 * instead: the week's own name where there is one ("Week II" → II), otherwise
 * the month it starts in. The year shrinks to two digits to make room, and the
 * status colour still groups them.
 */
function chipLabel(ed: Edition, sameYearCount: number): string {
  if (sameYearCount <= 1) return String(ed.year ?? "—");
  const yy = String(ed.year ?? "").slice(2);
  // "Week II" / "W2" → "II" / "2"; anything already short is used as-is.
  const stripped = (ed.label ?? "").replace(/^\s*(week|woche|w)\s*/i, "").trim();
  const disc = stripped && stripped.length <= 4 && stripped !== String(ed.year)
    ? stripped
    : ed.date_start
      ? MONTHS[new Date(ed.date_start).getUTCMonth()] ?? ""
      : "";
  return disc ? `${yy} · ${disc}` : String(ed.year ?? "—");
}

/** Year chips — each one opens that edition directly. They live inside the
 *  card/row button, so the click must not also trigger the parent. */
function EditionPills({ editions, onOpen }: { editions: Edition[]; onOpen?: (id: string) => void }) {
  if (!editions || editions.length === 0) {
    return <span className="text-xs admin-faint">—</span>;
  }
  const perYear = new Map<number | string, number>();
  for (const e of editions) perYear.set(e.year ?? "?", (perYear.get(e.year ?? "?") ?? 0) + 1);
  return (
    <div className="flex flex-wrap gap-1">
      {editions.map((ed, i) => {
        const open = onOpen && ed.id ? (e: React.MouseEvent | React.KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); onOpen(ed.id); } : undefined;
        return (
          <span
            key={ed.id ?? `${ed.year}-${i}`}
            {...(open ? {
              role: "link" as const,
              tabIndex: 0,
              onClick: open,
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") open(e); },
              title: `Open ${ed.label || ed.year}${ed.date_start ? ` · ${ed.date_start}` : ""}${ed.status ? ` · ${ed.status}` : ""}`,
            } : {})}
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${open ? "cursor-pointer hover:ring-1 hover:ring-current hover:-translate-y-px" : ""} ${
              ed.status === "published"
                ? "bg-[var(--admin-accent)]/15 text-[#0aa3c7]"
                : ed.status === "archived"
                ? "bg-gray-500/15 text-gray-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {chipLabel(ed, perYear.get(ed.year ?? "?") ?? 1)}
          </span>
        );
      })}
    </div>
  );
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return dir === "asc" ? aNum - bNum : bNum - aNum;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

export default function ExperiencesPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  // Resolved tile crew per experience — the same logic the public cards use
  // (override → next week's team in list order). One global fallback coach
  // here put Dennis on every single tile.
  const [crews, setCrews] = useState<Record<string, { name: string; cutout: string | null }[]>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("np7-exp-view") as ViewMode) || "tile";
    }
    return "tile";
  });
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()),
      fetch("/api/admin/tile-crews").then((r) => r.json()).catch(() => ({})),
    ]).then(([exps, eds, crewMap]) => {
      setExperiences(Array.isArray(exps) ? exps : exps.experiences || []);
      setEditions(Array.isArray(eds) ? eds : []);
      if (crewMap && typeof crewMap === "object") setCrews(crewMap);
      setLoading(false);
    });
  }, []);

  function editionsFor(expId: string): Edition[] {
    return editions
      .filter((e) => e.experience_id === expId)
      .sort((a, b) => b.year - a.year);
  }

  function setViewMode(mode: ViewMode) {
    setView(mode);
    localStorage.setItem("np7-exp-view", mode);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else { setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Default order inside each status group: the next trip first — this list is
  // "what am I selling soonest", not the alphabet. A clicked header overrides.
  const sorted = sortKey && sortDir
    ? [...experiences].sort((a, b) => compareValues(a[sortKey as keyof Experience], b[sortKey as keyof Experience], sortDir))
    : [...experiences].sort(makeNextTripCompare(editions));

  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  // Group by status — published on top, then draft, then archived.
  const STATUS_ORDER = ["published", "draft", "archived"];
  const statusGroups = [
    ...STATUS_ORDER.map((s) => ({ status: s, items: sorted.filter((e) => e.status === s) })),
    { status: "other", items: sorted.filter((e) => !STATUS_ORDER.includes(e.status)) },
  ].filter((g) => g.items.length > 0);

  function GroupHeading({ status, count }: { status: string; count: number }) {
    return (
      <div className="flex items-center gap-2 mb-2 mt-6 first:mt-0">
        <h2 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase">{STATUS_LABEL[status] ?? status}</h2>
        <span className="text-[10px] admin-faint">({count})</span>
      </div>
    );
  }

  function ExpRow({ exp }: { exp: Experience }) {
    return (
      <button
        onClick={() => router.push(`/admin/experiences/${exp.id}`)}
        className="w-full grid gap-4 px-5 py-3.5 transition-colors text-left"
        style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <span className="text-sm font-medium admin-heading truncate">{exp.title}</span>
        {visibleColumns.has("location") && <span className="text-xs admin-muted truncate self-center">{exp.location}</span>}
        {visibleColumns.has("hotel") && <span className="text-xs admin-faint truncate self-center">{exp.hotel || "—"}</span>}
        {visibleColumns.has("editions") && <span className="self-center"><EditionPills editions={editionsFor(exp.id)} onOpen={(id) => router.push(`/admin/editions/${id}`)} /></span>}
        {visibleColumns.has("status") && <span className="self-center flex items-center gap-1.5"><StatusBadge status={exp.status} />{exp.status === "published" && exp.website_visible === false && <OffWebsiteBadge />}</span>}
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Experiences</h1>
          <p className="text-sm admin-muted">Manage your trip templates and editions</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle
            columns={COLUMNS}
            visible={visibleColumns}
            onChange={setVisibleColumns}
            storageKey={STORAGE_KEY}
            label="Properties"
          />

          {/* View toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--admin-border)" }}
          >
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

          <Link
            href="/admin/experiences/new"
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
          >
            New Experience
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : experiences.length === 0 ? (
        <div className="py-12 text-center text-sm admin-faint">No experiences yet</div>
      ) : view === "list" ? (
        /* ── List view (grouped by status) ── */
        <div>
          {statusGroups.map((group) => (
            <div key={group.status}>
              <GroupHeading status={group.status} count={group.items.length} />
              <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
                <div
                  className="grid gap-4 px-5 py-3 admin-surface"
                  style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
                >
                  {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) => (
                    <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  ))}
                </div>
                {group.items.map((exp) => <ExpRow key={exp.id} exp={exp} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Tile view (grouped by status) ── */
        <div className="space-y-6">
          {statusGroups.map((group) => (
            <div key={group.status}>
              <GroupHeading status={group.status} count={group.items.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {group.items.map((exp) => {
                  const expEditions = editionsFor(exp.id);
                  return (
              <button
                key={exp.id}
                onClick={() => router.push(`/admin/experiences/${exp.id}`)}
                className="rounded-xl overflow-hidden text-left transition-all group"
                style={{ border: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--admin-text-faint)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--admin-border)")}
              >
                {/* Hero image */}
                <div className="relative aspect-[16/9] overflow-hidden" style={{ backgroundColor: "var(--admin-surface)" }}>
                  {exp.hero_image && exp.tile_auto ? (
                    /* mirrors the PUBLIC card exactly: photo + flag + place + coach */
                    <BrandedTile
                      photo={exp.hero_image}
                      place={placeFromLocation(exp.location).toUpperCase()}
                      flag={flagFromLocation(exp.location)}
                      coaches={crews[exp.id] ?? null}
                    />
                  ) : exp.hero_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={exp.hero_image}
                      alt={exp.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold admin-heading leading-tight">{exp.title}</h3>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={exp.status} />
                      {exp.status === "published" && exp.website_visible === false && <OffWebsiteBadge />}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-3">
                    <svg className="w-3.5 h-3.5 admin-faint flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-xs admin-muted truncate">{exp.location}</span>
                  </div>

                  <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
                    <span className="text-xs admin-faint">
                      {expEditions.length === 0 ? "No editions" : `${expEditions.length} edition${expEditions.length !== 1 ? "s" : ""}`}
                    </span>
                    <EditionPills editions={expEditions} onOpen={(id) => router.push(`/admin/editions/${id}`)} />
                  </div>
                </div>
              </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
