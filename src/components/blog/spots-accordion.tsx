"use client";

import { useState } from "react";
import {
  type Spot,
  type WindWindow,
  type ConditionsAvail,
  WIND_DIRECTIONS,
  WIND_QUALITY_META,
  CONDITION_TYPES,
  bestWinds,
  windWindowHasValue,
  conditionsAvailHasValue,
} from "@/lib/blog-templates";
import { BlogIcon } from "./blog-icons";
import { LevelBadge } from "@/components/shared/level-badge";
import { SpotNoteForm } from "./spot-note-form";
import type { SkillTag } from "@/lib/member-level";

export type SpotNote = {
  author_name: string | null; body: string;
  // attached when the author opted into a public profile (migration 035)
  displayName?: string | null; username?: string | null; avatarUrl?: string | null; initials?: string | null;
  // their level + verified skills (shown on hover), when they share their level
  level?: string | null; levelVerified?: boolean; skills?: SkillTag[];
};

/**
 * Foldable spot list. Each spot collapses to a scannable header (name + level /
 * water / best-wind chips); expanding reveals the photo, a wind rose, the
 * conditions-availability bars, member notes and on-site infrastructure. Keeps
 * a destination with many spots tidy. All collapsed by default — tap to open.
 *
 * When `slug` is set, each spot also shows approved member notes + an
 * "add a local tip" form.
 */
export function SpotsAccordion({
  spots,
  accent,
  slug,
  notesBySpot,
}: {
  spots: Spot[];
  accent: string;
  slug?: string;
  notesBySpot?: Record<string, SpotNote[]>;
}) {
  const [open, setOpen] = useState<number[]>([]);
  const toggle = (i: number) => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));

  return (
    <div className="space-y-3">
      {spots.map((spot, i) => {
        const isOpen = open.includes(i);
        const winds = bestWinds(spot.windWindow);
        const chips = [
          { icon: "gauge", label: spot.level },
          { icon: "wave", label: spot.waterType },
          { icon: "wind", label: winds.length ? winds.join(", ") : "" },
        ].filter((c) => c.label);
        return (
          <div key={i} className="rounded-2xl border border-[#ece3d3] bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 sm:gap-4 px-5 py-4 text-left hover:bg-[#fdfaf3] transition-colors"
            >
              <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full text-[13px] font-black" style={{ backgroundColor: `${accent}1a`, color: accent }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] sm:text-[17px] font-extrabold text-[#00374a] truncate">{spot.name || `Spot ${i + 1}`}</div>
                {chips.length > 0 && (
                  <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {chips.map((c, j) => (
                      <span key={j} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#6a7a80]">
                        <span style={{ color: accent }}><BlogIcon name={c.icon} className="w-[13px] h-[13px]" /></span>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <svg className={`shrink-0 w-5 h-5 text-[#9aa6ac] transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {isOpen && (
              <div className="px-5 pb-6 pt-1">
                {spot.image && (
                  <div className="relative h-44 sm:h-56 rounded-xl overflow-hidden bg-[#e9eef0] mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={spot.image} alt={spot.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                {/* mobile chips (header hides them under sm) */}
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4 sm:hidden">
                    {chips.map((c, j) => (
                      <span key={j} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#00374a] rounded-full px-3 py-1.5" style={{ backgroundColor: `${accent}14` }}>
                        <span style={{ color: accent }}><BlogIcon name={c.icon} className="w-[15px] h-[15px]" /></span>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}

                {(windWindowHasValue(spot.windWindow) || conditionsAvailHasValue(spot.conditionsAvail)) && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8 mb-4 p-4 rounded-xl bg-[#fdfaf3] border border-[#f0e9da]">
                    {windWindowHasValue(spot.windWindow) && (
                      <div className="shrink-0">
                        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Wind window</div>
                        <div className="flex items-center gap-4">
                          <WindRose window={spot.windWindow} />
                          <ul className="space-y-1">
                            {WIND_QUALITY_META.map((q) => (
                              <li key={q.id} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5a6b72]">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.color }} />
                                {q.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {conditionsAvailHasValue(spot.conditionsAvail) && (
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Conditions</div>
                        <FrequencyBars avail={spot.conditionsAvail} accent={accent} />
                      </div>
                    )}
                  </div>
                )}

                {spot.conditions && <p className="text-[15.5px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{spot.conditions}</p>}
                {spot.infrastructure.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mr-1">On site</span>
                    {spot.infrastructure.map((t, j) => (
                      <span key={j} className="text-[12px] font-semibold text-[#5a6b72] bg-[#f3ede0] rounded-full px-2.5 py-1">{t}</span>
                    ))}
                  </div>
                )}

                {slug && (
                  <div className="mt-5 pt-4 border-t border-[#f0e9da]">
                    {(() => {
                      const notes = notesBySpot?.[spot.name] ?? [];
                      return notes.length > 0 ? (
                        <>
                          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2.5">Local notes</div>
                          <ul className="space-y-3">
                            {notes.map((note, k) => {
                              const who = note.displayName || note.author_name || "Member";
                              return (
                                <li key={k} className="flex gap-3">
                                  {note.avatarUrl ? (
                                    <span className="shrink-0 w-9 h-9 rounded-full bg-cover bg-center ring-1 ring-[#00374a]/5" style={{ backgroundImage: `url('${note.avatarUrl}')` }} aria-hidden="true" />
                                  ) : (
                                    <span className="shrink-0 w-9 h-9 rounded-full grid place-items-center bg-[#eef3f4] text-[#6a7a80] text-[12.5px] font-bold ring-1 ring-[#00374a]/5" aria-hidden="true">{(note.initials || who[0]).toUpperCase()}</span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                                      <span className="font-bold text-[#00374a] text-[14px] leading-tight">{who}</span>
                                      {note.username && <span className="text-[12px] text-[#9aa6ac] leading-tight">@{note.username}</span>}
                                      {note.level && <LevelBadge level={note.level} verified={!!note.levelVerified} skills={note.skills ?? []} align="left" />}
                                    </div>
                                    <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mt-1">{note.body}</p>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      ) : null;
                    })()}
                    <SpotNoteForm slug={slug} spotName={spot.name} accent={accent} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- wind rose ----------------------------- */

function qualityColor(q: string): string {
  return q === "best" ? "#1f9e57" : q === "good" ? "#e0922a" : q === "no" ? "#d3dbdf" : "#eef1f2";
}

function wedgePath(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
  const xy = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const [x1, y1] = xy(ro, a0);
  const [x2, y2] = xy(ro, a1);
  const [x3, y3] = xy(ri, a1);
  const [x4, y4] = xy(ri, a0);
  return `M ${x1} ${y1} A ${ro} ${ro} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 0 0 ${x4} ${y4} Z`;
}

function WindRose({ window: w }: { window: WindWindow }) {
  const cx = 65, cy = 65, ri = 24, ro = 50, labelR = 60;
  return (
    <svg viewBox="0 0 130 130" className="w-[120px] h-[120px] shrink-0" role="img" aria-label="Wind directions">
      {WIND_DIRECTIONS.map((d, i) => {
        const center = i * 45;
        return <path key={d} d={wedgePath(cx, cy, ri, ro, center - 22.5, center + 22.5)} fill={qualityColor(w[d] ?? "")} stroke="#fff" strokeWidth="1.5" />;
      })}
      {WIND_DIRECTIONS.map((d, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        return (
          <text key={d} x={cx + labelR * Math.cos(a)} y={cy + labelR * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="800" fill="#5a6b72">
            {d}
          </text>
        );
      })}
    </svg>
  );
}

function FrequencyBars({ avail, accent }: { avail: ConditionsAvail; accent: string }) {
  const level = (f: string) => (f === "often" ? 3 : f === "sometimes" ? 2 : f === "never" ? 1 : 0);
  const label = (f: string) => (f === "often" ? "Often" : f === "sometimes" ? "Sometimes" : f === "never" ? "Never" : "—");
  return (
    <div className="space-y-2">
      {CONDITION_TYPES.map((t) => {
        const f = avail[t.key] ?? "";
        if (!f) return null;
        const n = level(f);
        return (
          <div key={t.key} className="flex items-center gap-3">
            <span className="w-20 text-[13px] font-semibold text-[#00374a]">{t.label}</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((k) => (
                <span key={k} className="w-6 h-1.5 rounded-full" style={{ backgroundColor: k <= n ? accent : "#e7ecee" }} />
              ))}
            </div>
            <span className="text-[12px] font-semibold text-[#6a7a80]">{label(f)}</span>
          </div>
        );
      })}
    </div>
  );
}
