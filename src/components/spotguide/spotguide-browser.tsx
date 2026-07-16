"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SpotguideDestinationCard } from "@/lib/spotguide-data";
import { levelRangeLabel, DESTINATION_TAGS } from "@/lib/spotguide";
import { LEVELS } from "@/lib/member-level";
import { RatingHeadline } from "./rating-panel";
import { SpotMap, type MapSpot } from "./spot-map";

/**
 * The spotguide destination grid + a light, unobtrusive filter (country · level
 * · vibe tags). Client-side so it filters instantly; facets only appear when
 * there's something to filter by, so it stays quiet until the guide grows.
 */
const CORE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];

// Long-tail countries are grouped by continent inside the "All places" panel.
const CONTINENT_OF: Record<string, string> = {
  Germany: "Europe", Netherlands: "Europe", Italy: "Europe", Spain: "Europe", Norway: "Europe",
  Croatia: "Europe", Turkey: "Europe", Greece: "Europe", France: "Europe", Portugal: "Europe",
  Denmark: "Europe", Sweden: "Europe", Poland: "Europe", Austria: "Europe", Switzerland: "Europe",
  "United Kingdom": "Europe", Ireland: "Europe",
  "South Africa": "Africa", Madagascar: "Africa", Mauritius: "Africa", Morocco: "Africa",
  Egypt: "Africa", "Cape Verde": "Africa", Kenya: "Africa",
  "United States": "Americas", "Dutch Caribbean": "Americas", Bonaire: "Americas", Brazil: "Americas",
  "Dominican Republic": "Americas", Aruba: "Americas", "Curaçao": "Americas", Venezuela: "Americas",
  Canada: "Americas", Mexico: "Americas", Chile: "Americas", Peru: "Americas", "Costa Rica": "Americas",
  Australia: "Oceania", "New Zealand": "Oceania", Fiji: "Oceania", "French Polynesia": "Oceania",
  Japan: "Asia", Thailand: "Asia", Philippines: "Asia", Vietnam: "Asia", "Sri Lanka": "Asia",
  Israel: "Asia", "United Arab Emirates": "Asia", Oman: "Asia", Indonesia: "Asia",
};
const CONTINENT_ORDER = ["Europe", "Africa", "Americas", "Asia", "Oceania", "Other"];
const continentOf = (c: string | null) => (c && CONTINENT_OF[c]) || "Other";

export function SpotguideBrowser({ dests, accent = "#00afdb", section = "experience", mapSpots }: {
  dests: SpotguideDestinationCard[]; accent?: string; section?: "experience" | "hardware";
  /** Pin data for the index map — rendered INSIDE the browser so the filter drives it. */
  mapSpots?: MapSpot[];
}) {
  const router = useRouter();
  const [country, setCountry] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [tags, setTags] = useState<Set<string>>(new Set());
  // "More places" combobox
  const [whereOpen, setWhereOpen] = useState(false);
  const [whereQ, setWhereQ] = useState("");
  const whereRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!whereOpen) return;
    const close = (e: MouseEvent) => { if (whereRef.current && !whereRef.current.contains(e.target as Node)) setWhereOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [whereOpen]);

  const rankIdx = (l: string | null) => (l ? LEVELS.indexOf(l as (typeof LEVELS)[number]) : -1);
  const fitsLevel = (d: SpotguideDestinationCard, sel: string) => {
    const si = rankIdx(sel);
    if (si === -1) return true;
    const lo = d.level_min ? rankIdx(d.level_min) : 0;
    const hi = d.level_max ? rankIdx(d.level_max) : LEVELS.length - 1;
    return si >= (lo < 0 ? 0 : lo) && si <= (hi < 0 ? LEVELS.length - 1 : hi);
  };

  // Where facet: countries ranked by destination count. The first few are
  // one-tap pills; everything else lives in the searchable "More places"
  // panel (grouped by continent) — so the row never outgrows one line.
  const QUICK_PILLS = 6;
  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dests) if (d.country) counts.set(d.country, (counts.get(d.country) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [dests]);
  const quickCountries = countryCounts.slice(0, QUICK_PILLS).map(([c]) => c);
  const moreCountries = countryCounts.slice(QUICK_PILLS);
  const levelOpts = useMemo(() => CORE_LEVELS.filter((l) => dests.some((d) => fitsLevel(d, l))), [dests]);
  const tagOpts = useMemo(() => {
    const present = new Set(dests.flatMap((d) => d.tags));
    return DESTINATION_TAGS.filter((t) => present.has(t)); // curated order, only what exists
  }, [dests]);

  const filtered = useMemo(() => dests.filter((d) =>
    (!country || d.country === country) &&
    (!level || fitsLevel(d, level)) &&
    (tags.size === 0 || [...tags].every((t) => d.tags.includes(t)))
  ), [dests, country, level, tags]);

  const active = !!country || !!level || tags.size > 0;

  // Combobox results: countries + destinations matching the query.
  const whereResults = useMemo(() => {
    const q = whereQ.trim().toLowerCase();
    const cs = (q ? countryCounts.filter(([c]) => c.toLowerCase().includes(q)) : moreCountries.length ? countryCounts : []);
    const ds = q ? dests.filter((d) => `${d.name} ${d.region ?? ""}`.toLowerCase().includes(q)).slice(0, 6) : [];
    // group countries by continent for a scannable list
    const groups = new Map<string, [string, number][]>();
    for (const [c, n] of cs) {
      const key = continentOf(c);
      groups.set(key, [...(groups.get(key) ?? []), [c, n]]);
    }
    return { groups: CONTINENT_ORDER.filter((k) => groups.has(k)).map((k) => ({ continent: k, countries: groups.get(k)! })), dests: ds };
  }, [whereQ, countryCounts, moreCountries.length, dests]);
  const toggleTag = (t: string) => setTags((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const pill = (on: boolean, onClick: () => void, label: string) => (
    <button key={label} type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${on ? "text-white border-transparent" : "text-[#5a6b72] border-[#e6ddca] bg-white/70 hover:border-[#cdbfa2]"}`}
      style={on ? { backgroundColor: accent } : undefined}>
      {label}
    </button>
  );

  const hasFilters = countryCounts.length > 1 || levelOpts.length > 1 || tagOpts.length > 0;

  return (
    <div>
      {mapSpots && mapSpots.length > 0 && (
        <div className="mb-6">
          <SpotMap spots={mapSpots} cluster height={460} linkLabel="Explore the spots →"
            focusDests={active ? filtered.map((d) => d.slug).filter((s): s is string => !!s) : null} />
        </div>
      )}
      {hasFilters && (
        <div className="mb-6 flex flex-col gap-2.5">
          {countryCounts.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* label first, then the "All places" search (via flex order), then countries by popularity */}
              <span className="[order:-2] text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mr-1 w-14 shrink-0">Where</span>
              {quickCountries.map((c) => pill(country === c, () => { setCountry(country === c ? null : c); setWhereOpen(false); }, c))}
              {/* selected from the long tail keeps its own pill visible */}
              {country && !quickCountries.includes(country) && pill(true, () => setCountry(null), country)}
              {moreCountries.length > 0 && (
                <div className="relative [order:-1]" ref={whereRef}>
                  <button type="button" onClick={() => { setWhereOpen((o) => !o); setWhereQ(""); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${whereOpen ? "border-[#cdbfa2] bg-white" : "text-[#5a6b72] border-[#e6ddca] bg-white/70 hover:border-[#cdbfa2]"}`}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    All places
                  </button>
                  {whereOpen && (
                    <div className="absolute z-30 left-0 top-full mt-2 w-[290px] rounded-2xl border border-[#e6ddca] bg-white shadow-[0_18px_44px_rgba(0,55,74,0.14)] overflow-hidden">
                      <input autoFocus value={whereQ} onChange={(e) => setWhereQ(e.target.value)} placeholder="Search country or destination…"
                        className="w-full px-4 py-3 text-[13.5px] text-[#0a2a33] placeholder:text-[#b6ab90] outline-none border-b border-[#f0e6d6]" />
                      <div className="max-h-[300px] overflow-y-auto py-1.5">
                        {whereResults.dests.map((d) => (
                          <button key={d.id} type="button" onClick={() => router.push(`/spotguide/${d.slug}?from=${section}`)}
                            className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[13.5px] hover:bg-[#fbf7ee]">
                            <span className="font-bold text-[#00374a] truncate">{d.name}</span>
                            <span className="shrink-0 text-[11.5px] text-[#9aa6ac]">{d.country}</span>
                          </button>
                        ))}
                        {whereResults.groups.map((g) => (
                          <div key={g.continent}>
                            <p className="px-4 pt-2.5 pb-1 text-[10.5px] font-black uppercase tracking-[0.12em] text-[#b6ab90]">{g.continent}</p>
                            {g.countries.map(([c, n]) => (
                              <button key={c} type="button" onClick={() => { setCountry(c); setWhereOpen(false); }}
                                className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[13.5px] hover:bg-[#fbf7ee] ${country === c ? "font-bold" : ""}`} style={country === c ? { color: accent } : { color: "#3a4a50" }}>
                                <span>{c}</span>
                                <span className="text-[11.5px] text-[#9aa6ac]">{n}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                        {whereQ.trim() !== "" && whereResults.dests.length === 0 && whereResults.groups.length === 0 && (
                          <p className="px-4 py-3 text-[12.5px] text-[#9aa6ac]">Nothing matches — try another spelling.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {levelOpts.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mr-1 w-14 shrink-0">Level</span>
              {levelOpts.map((l) => pill(level === l, () => setLevel(level === l ? null : l), l))}
            </div>
          )}
          {tagOpts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mr-1 w-14 shrink-0">Vibe</span>
              {tagOpts.map((t) => pill(tags.has(t), () => toggleTag(t), t))}
            </div>
          )}
          {active && (
            <div className="flex items-center gap-3 text-[12px]">
              <span className="text-[#9aa6ac]">{filtered.length} of {dests.length} destination{dests.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => { setCountry(null); setLevel(null); setTags(new Set()); }} className="font-semibold text-[#8a9aa0] underline hover:text-[#00374a]">Clear</button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-[14px] text-[#6a7a80] py-10 text-center">No destinations match those filters yet — try clearing one.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((d) => {
            const lvl = levelRangeLabel(d.level_min, d.level_max);
            return (
              <Link key={d.id} href={`/spotguide/${d.slug}?from=${section}`}
                className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-[#f0e6d6] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,55,74,0.10)] transition-all">
                <div className="relative aspect-[16/10] bg-cover bg-center bg-[#e9eef0]" style={{ backgroundImage: `url('${d.image}')` }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                  <div className="absolute left-4 bottom-3 right-4">
                    <h2 className="text-white text-[20px] font-black tracking-[-0.02em] leading-tight">{d.name}</h2>
                    <p className="text-white/80 text-[12.5px] font-semibold">{[d.region, d.country].filter(Boolean).join(", ")}</p>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-2.5">
                  <RatingHeadline np7={d.np7} member={d.member} accent={accent} />
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px] font-semibold text-[#6a7a80]">
                    <span>{d.spotCount} spot{d.spotCount === 1 ? "" : "s"}</span>
                    {lvl && <><span className="text-[#d8cdbb]">·</span><span>{lvl}</span></>}
                  </div>
                  {d.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {d.tags.slice(0, 3).map((t) => <span key={t} className="text-[10.5px] font-bold text-[#6a7a80] bg-[#f4efe4] rounded-full px-2 py-0.5">{t}</span>)}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
