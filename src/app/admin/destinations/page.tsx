"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Experience {
  id: string;
  title: string;
  location: string | null;
  hero_image: string | null;
  status: string;
  airport_code: string | null;
}

// Destinations are derived from experience locations — editing a destination
// means editing the location/hero on its experiences.
export default function DestinationsPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/experiences")
      .then((r) => r.json())
      .then((d) => {
        setExperiences(Array.isArray(d) ? d : d.experiences || []);
        setLoading(false);
      });
  }, []);

  const destinations = new Map<string, Experience[]>();
  for (const e of experiences) {
    const loc = e.location || "No location set";
    if (!destinations.has(loc)) destinations.set(loc, []);
    destinations.get(loc)!.push(e);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">Destinations</h1>
        <p className="text-sm admin-muted">
          {destinations.size} destination{destinations.size !== 1 ? "s" : ""} — derived from experience
          locations. Edit a destination&apos;s name, image, or airport on its experiences.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {Array.from(destinations.entries()).map(([loc, exps]) => (
            <div
              key={loc}
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            >
              {exps[0]?.hero_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={exps[0].hero_image} alt={loc} className="w-full h-32 object-cover" />
              ) : (
                <div className="w-full h-32 flex items-center justify-center admin-faint text-xs" style={{ backgroundColor: "var(--admin-bg)" }}>
                  No image
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold admin-heading truncate">{loc}</h2>
                  {exps[0]?.airport_code && (
                    <span className="text-[10px] font-mono admin-faint">{exps[0].airport_code}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {exps.map((e) => (
                    <Link
                      key={e.id}
                      href={`/admin/experiences/${e.id}`}
                      className="flex items-center justify-between text-xs admin-muted hover:text-[#0aa3c7] transition-colors"
                    >
                      <span className="truncate">{e.title}</span>
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                        e.status === "published" ? "bg-green-500/15 text-green-400" :
                        e.status === "archived" ? "bg-red-500/15 text-red-400" :
                        "admin-surface admin-faint"
                      }`}>{e.status}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
