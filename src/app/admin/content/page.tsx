"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { makeNextTripCompare, type DatedEdition } from "@/lib/next-trip-order";

interface Experience {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  status: string;
}

export default function ContentHubPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<DatedEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

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

  // Same order as the Experiences overview — active first, then draft, then
  // archived, and inside each group by the next trip's date. Alphabetical put
  // unfinished drafts above the trips being sold.
  const STATUS_ORDER = ["published", "draft", "archived"];
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

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="mb-2">
        <h1 className="text-2xl font-bold admin-heading">Website Content</h1>
        <p className="text-sm admin-muted mt-1">
          Edit the public-page narrative for each experience — the spot, the week, the daily
          program and FAQ. Operational data (dates, packages, spots) stays on the experience itself.
        </p>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search experiences…"
        className="admin-input w-full sm:w-80 mt-5 mb-6 px-4 py-2.5 rounded-lg border text-sm outline-none"
      />

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm admin-faint">No experiences found.</p>
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((e) => (
            <Link
              key={e.id}
              href={`/admin/content/${e.id}`}
              className="group flex items-center justify-between gap-4 admin-surface admin-border border rounded-xl px-5 py-4 hover:border-[var(--admin-accent)] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold admin-heading truncate">{e.title}</span>
                  <span
                    className={`shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
                      e.status === "published"
                        ? "bg-green-500/15 text-green-400"
                        : e.status === "archived"
                        ? "bg-red-500/15 text-red-400"
                        : "admin-surface admin-muted"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>
                <span className="text-xs admin-faint">{e.location ?? "—"}</span>
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
  );
}
