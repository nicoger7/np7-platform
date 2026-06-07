"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Experience {
  id: string;
  title: string;
  slug: string;
  location: string;
  date_start: string;
  date_end: string;
  price: number;
  max_spots: number;
  spots_taken: number;
  status: string;
  hero_image: string;
  hotel: string | null;
  airport_code: string | null;
}

type ViewMode = "list" | "tile";

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${s.getFullYear()}`;
}

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
      {status}
    </span>
  );
}

function SpotsIndicator({ taken, max }: { taken: number; max: number }) {
  const pct = max > 0 ? taken / max : 0;
  const left = max - taken;
  return (
    <span className="text-sm">
      <span
        className={
          pct >= 1
            ? "text-red-400"
            : pct >= 0.75
            ? "text-amber-400"
            : "admin-muted"
        }
      >
        {taken}/{max}
      </span>
      {left > 0 && (
        <span className="admin-faint ml-1 text-xs">({left} left)</span>
      )}
    </span>
  );
}

export default function ExperiencesPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("np7-exp-view") as ViewMode) || "list";
    }
    return "list";
  });
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/experiences")
      .then((r) => r.json())
      .then((d) => {
        setExperiences(d.experiences || []);
        setLoading(false);
      });
  }, []);

  function setViewMode(mode: ViewMode) {
    setView(mode);
    localStorage.setItem("np7-exp-view", mode);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Experiences</h1>
          <p className="text-sm admin-muted">Manage your trips and events</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            <button
              onClick={() => setViewMode("list")}
              className="p-2 transition-colors"
              style={{
                backgroundColor:
                  view === "list" ? "var(--admin-active)" : "transparent",
                color:
                  view === "list"
                    ? "var(--admin-text)"
                    : "var(--admin-text-faint)",
              }}
              title="List view"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("tile")}
              className="p-2 transition-colors"
              style={{
                backgroundColor:
                  view === "tile" ? "var(--admin-active)" : "transparent",
                color:
                  view === "tile"
                    ? "var(--admin-text)"
                    : "var(--admin-text-faint)",
                borderLeft: "1px solid var(--admin-border)",
              }}
              title="Tile view"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </div>

          <Link
            href="/admin/experiences/new"
            className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors"
          >
            New Experience
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : experiences.length === 0 ? (
        <div className="py-12 text-center text-sm admin-faint">
          No experiences yet
        </div>
      ) : view === "list" ? (
        /* ── List view ── */
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--admin-border)" }}
        >
          <div
            className="grid grid-cols-[1fr_120px_100px_160px_80px_80px_90px] gap-4 px-5 py-3 admin-surface"
            style={{ borderBottom: "1px solid var(--admin-border)" }}
          >
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Title
            </span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Location
            </span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Hotel
            </span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Dates
            </span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Spots
            </span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Price
            </span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
              Status
            </span>
          </div>

          {experiences.map((exp) => (
            <button
              key={exp.id}
              onClick={() => router.push(`/admin/experiences/${exp.id}`)}
              className="w-full grid grid-cols-[1fr_120px_100px_160px_80px_80px_90px] gap-4 px-5 py-3.5 transition-colors text-left"
              style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--admin-surface-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <span className="text-sm font-medium admin-heading truncate">
                {exp.title}
              </span>
              <span className="text-xs admin-muted truncate self-center">
                {exp.location}
              </span>
              <span className="text-xs admin-faint truncate self-center">
                {exp.hotel || "—"}
              </span>
              <span className="text-xs admin-muted self-center">
                {exp.date_start && exp.date_end
                  ? formatDateRange(exp.date_start, exp.date_end)
                  : "—"}
              </span>
              <SpotsIndicator taken={exp.spots_taken} max={exp.max_spots} />
              <span className="text-xs admin-muted self-center">
                {exp.price ? `€${Number(exp.price).toLocaleString()}` : "—"}
              </span>
              <span className="self-center">
                <StatusBadge status={exp.status} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        /* ── Tile view ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {experiences.map((exp) => {
            const spotsLeft = exp.max_spots - exp.spots_taken;
            return (
              <button
                key={exp.id}
                onClick={() => router.push(`/admin/experiences/${exp.id}`)}
                className="rounded-xl overflow-hidden text-left transition-all group"
                style={{ border: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "var(--admin-text-faint)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "var(--admin-border)")
                }
              >
                {/* Hero image */}
                <div
                  className="aspect-[16/9] overflow-hidden"
                  style={{ backgroundColor: "var(--admin-surface)" }}
                >
                  {exp.hero_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={exp.hero_image}
                      alt={exp.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg
                        className="w-10 h-10 admin-faint"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
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
                    <h3 className="text-sm font-semibold admin-heading leading-tight">
                      {exp.title}
                    </h3>
                    <StatusBadge status={exp.status} />
                  </div>

                  <div className="flex items-center gap-1.5 mb-3">
                    <svg
                      className="w-3.5 h-3.5 admin-faint flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-xs admin-muted truncate">
                      {exp.location}
                    </span>
                  </div>

                  <div
                    className="flex items-center justify-between pt-3 text-xs"
                    style={{ borderTop: "1px solid var(--admin-border)" }}
                  >
                    <span className="admin-muted">
                      {exp.date_start && exp.date_end
                        ? formatDateRange(exp.date_start, exp.date_end)
                        : "No dates"}
                    </span>
                    <div className="flex items-center gap-3">
                      {exp.price > 0 && (
                        <span className="admin-muted font-medium">
                          €{Number(exp.price).toLocaleString()}
                        </span>
                      )}
                      <span
                        className={`font-medium ${
                          spotsLeft <= 0
                            ? "text-red-400"
                            : spotsLeft <= 3
                            ? "text-amber-400"
                            : "admin-muted"
                        }`}
                      >
                        {spotsLeft <= 0
                          ? "Full"
                          : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
