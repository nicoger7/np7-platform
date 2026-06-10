"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Package {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  cost_per_person: number | null;
  deposit: number | null;
  max_spots: number | null;
  sort_order: number;
  status: string;
  category: string | null;
  date: string | null;
  includes: string | null;
  experience_id: string | null;
  edition_id: string | null;
  exp_experiences: { id: string; title: string } | null;
  // computed in the API
  component_count: number;
  cost_estimate: number | null;
  margin: number | null;
}

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString()}` : "—";
}

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  exp_experiences: { id: string; title: string } | null;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
        status === "active"
          ? "bg-green-500/15 text-green-400"
          : status === "sold_out"
          ? "bg-red-500/15 text-red-400"
          : "bg-gray-500/15 text-gray-400"
      }`}
    >
      {status?.replace("_", " ") || "—"}
    </span>
  );
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEditionId, setFilterEditionId] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/packages").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()),
    ]).then(([pkgs, eds]) => {
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEditions(Array.isArray(eds) ? eds : []);
      setLoading(false);
    });
  }, []);

  // Build edition label map
  const editionMap = new Map<string, string>(
    editions.map((e) => [
      e.id,
      `${e.exp_experiences?.title || "Unknown"} — ${e.year}`,
    ])
  );

  function getEditionLabel(pkg: Package): string {
    if (pkg.edition_id && editionMap.has(pkg.edition_id)) {
      return editionMap.get(pkg.edition_id)!;
    }
    return pkg.exp_experiences?.title || "No Experience";
  }

  const filtered = filterEditionId
    ? packages.filter((p) => p.edition_id === filterEditionId)
    : packages;

  // Group by edition label
  const grouped = new Map<string, { pkgs: Package[]; editionId: string | null; experienceId: string | null }>();
  for (const pkg of filtered) {
    const key = getEditionLabel(pkg);
    if (!grouped.has(key)) {
      grouped.set(key, {
        pkgs: [],
        editionId: pkg.edition_id,
        experienceId: pkg.experience_id,
      });
    }
    grouped.get(key)!.pkgs.push(pkg);
  }

  const sortedEditions = editions.slice().sort((a, b) => {
    const aTitle = a.exp_experiences?.title || "";
    const bTitle = b.exp_experiences?.title || "";
    return aTitle.localeCompare(bTitle) || a.year - b.year;
  });

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Packages</h1>
          <p className="text-sm admin-muted">
            {filtered.length} package{filtered.length !== 1 ? "s" : ""} across{" "}
            {grouped.size} edition{grouped.size !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filter by edition */}
      <div className="mb-5">
        <select
          className={`${inputClass} max-w-xs`}
          value={filterEditionId}
          onChange={(e) => setFilterEditionId(e.target.value)}
        >
          <option value="">All Editions</option>
          {sortedEditions.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.exp_experiences?.title || "Unknown"} — {ed.year}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No packages yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([label, group]) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold admin-heading">{label}</h2>
                {group.editionId && (
                  <Link
                    href={`/admin/editions/${group.editionId}`}
                    className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                  >
                    View edition →
                  </Link>
                )}
              </div>
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                <div
                  className="grid grid-cols-[1fr_90px_80px_80px_90px_55px_70px_70px_80px] gap-3 px-5 py-3 admin-surface"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Sell</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Cost</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Margin</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Comps</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Deposit</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Spots</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                </div>
                {group.pkgs.map((pkg) => (
                  <Link
                    key={pkg.id}
                    href={
                      pkg.edition_id
                        ? `/admin/editions/${pkg.edition_id}`
                        : pkg.experience_id
                        ? `/admin/experiences/${pkg.experience_id}`
                        : "#"
                    }
                    className="grid grid-cols-[1fr_90px_80px_80px_90px_55px_70px_70px_80px] gap-3 px-5 py-3 transition-colors block"
                    style={{ borderBottom: "1px solid var(--admin-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <span className="text-sm font-medium admin-heading truncate">{pkg.name}</span>
                    <span className="text-xs admin-muted self-center capitalize">{pkg.category || "—"}</span>
                    <span className="text-xs admin-muted self-center">{money(pkg.price)}</span>
                    <span className="text-xs admin-muted self-center">
                      {money(pkg.cost_estimate)}
                      {pkg.cost_per_person == null && pkg.cost_estimate != null && (
                        <span className="ml-1 text-[9px] text-[#0aa3c7]" title="Derived from components">~</span>
                      )}
                    </span>
                    <span className={`text-xs self-center font-medium ${pkg.margin == null ? "admin-faint" : pkg.margin < 0 ? "text-red-400" : "text-green-400"}`}>
                      {money(pkg.margin)}
                    </span>
                    <span className="text-xs admin-muted self-center">{pkg.component_count || "—"}</span>
                    <span className="text-xs admin-muted self-center">{money(pkg.deposit)}</span>
                    <span className="text-xs admin-muted self-center">{pkg.max_spots ?? "—"}</span>
                    <span className="self-center">
                      <StatusBadge status={pkg.status} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
