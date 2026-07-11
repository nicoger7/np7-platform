"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SpotguideDestinationCard } from "@/lib/spotguide-data";
import { levelRangeLabel, DESTINATION_TAGS } from "@/lib/spotguide";
import { LEVELS } from "@/lib/member-level";
import { RatingHeadline } from "./rating-panel";

/**
 * The spotguide destination grid + a light, unobtrusive filter (country · level
 * · vibe tags). Client-side so it filters instantly; facets only appear when
 * there's something to filter by, so it stays quiet until the guide grows.
 */
const CORE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];

export function SpotguideBrowser({ dests, accent = "#00afdb", section = "experience" }: { dests: SpotguideDestinationCard[]; accent?: string; section?: "experience" | "hardware" }) {
  const [country, setCountry] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [tags, setTags] = useState<Set<string>>(new Set());

  const rankIdx = (l: string | null) => (l ? LEVELS.indexOf(l as (typeof LEVELS)[number]) : -1);
  const fitsLevel = (d: SpotguideDestinationCard, sel: string) => {
    const si = rankIdx(sel);
    if (si === -1) return true;
    const lo = d.level_min ? rankIdx(d.level_min) : 0;
    const hi = d.level_max ? rankIdx(d.level_max) : LEVELS.length - 1;
    return si >= (lo < 0 ? 0 : lo) && si <= (hi < 0 ? LEVELS.length - 1 : hi);
  };

  // Facets — only render a group when it actually has ≥2 useful options.
  const countries = useMemo(() => [...new Set(dests.map((d) => d.country).filter(Boolean) as string[])].sort(), [dests]);
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
  const toggleTag = (t: string) => setTags((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const pill = (on: boolean, onClick: () => void, label: string) => (
    <button key={label} type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${on ? "text-white border-transparent" : "text-[#5a6b72] border-[#e6ddca] bg-white/70 hover:border-[#cdbfa2]"}`}
      style={on ? { backgroundColor: accent } : undefined}>
      {label}
    </button>
  );

  const hasFilters = countries.length > 1 || levelOpts.length > 1 || tagOpts.length > 0;

  return (
    <div>
      {hasFilters && (
        <div className="mb-6 flex flex-col gap-2.5">
          {countries.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mr-1 w-14 shrink-0">Country</span>
              {countries.map((c) => pill(country === c, () => setCountry(country === c ? null : c), c))}
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
