"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Package {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  deposit: number | null;
  max_spots: number | null;
  sort_order: number;
  status: string;
  category: string | null;
  experience_id: string | null;
  exp_experiences: { title: string } | null;
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
  const [loading, setLoading] = useState(true);
  const [filterExp, setFilterExp] = useState("");

  useEffect(() => {
    fetch("/api/admin/packages")
      .then((r) => r.json())
      .then((d) => {
        setPackages(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const experiences = Array.from(
    new Map(
      packages
        .filter((p) => p.exp_experiences)
        .map((p) => [p.experience_id, p.exp_experiences!.title])
    ).values()
  ).sort();

  const filtered = filterExp
    ? packages.filter((p) => p.exp_experiences?.title === filterExp)
    : packages;

  // Group by experience
  const grouped = new Map<string, Package[]>();
  for (const pkg of filtered) {
    const key = pkg.exp_experiences?.title || "No Experience";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(pkg);
  }

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Packages</h1>
          <p className="text-sm admin-muted">
            {filtered.length} package{filtered.length !== 1 ? "s" : ""} across{" "}
            {grouped.size} experience{grouped.size !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-5">
        <select
          className={`${inputClass} max-w-xs`}
          value={filterExp}
          onChange={(e) => setFilterExp(e.target.value)}
        >
          <option value="">All Experiences</option>
          {experiences.map((t) => (
            <option key={t} value={t}>
              {t}
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
          {Array.from(grouped.entries()).map(([expTitle, pkgs]) => (
            <div key={expTitle}>
              <h2 className="text-sm font-bold admin-heading mb-3">{expTitle}</h2>
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                <div
                  className="grid grid-cols-[1fr_100px_90px_90px_80px_80px] gap-3 px-5 py-3 admin-surface"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
                    Name
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
                    Category
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
                    Price
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
                    Deposit
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
                    Spots
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
                    Status
                  </span>
                </div>
                {pkgs.map((pkg) => (
                  <Link
                    key={pkg.id}
                    href={`/admin/experiences/${pkg.experience_id}`}
                    className="grid grid-cols-[1fr_100px_90px_90px_80px_80px] gap-3 px-5 py-3 transition-colors block"
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
                      {pkg.name}
                    </span>
                    <span className="text-xs admin-muted self-center capitalize">
                      {pkg.category || "—"}
                    </span>
                    <span className="text-xs admin-muted self-center">
                      {pkg.price != null ? `€${pkg.price.toLocaleString()}` : "—"}
                    </span>
                    <span className="text-xs admin-muted self-center">
                      {pkg.deposit != null
                        ? `€${pkg.deposit.toLocaleString()}`
                        : "—"}
                    </span>
                    <span className="text-xs admin-muted self-center">
                      {pkg.max_spots ?? "—"}
                    </span>
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
