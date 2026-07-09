"use client";

import { useState } from "react";
import { BFT_META, MONTH_LABELS, type WindStats } from "@/lib/wind-stats";

/** Short, rider-friendly name for a model read, from its `source` string. */
function modelLabel(source: string): string {
  const s = (source ?? "").toLowerCase();
  if (s.startsWith("np7")) return "NP7 local";
  if (s.includes("accel") || s.includes("offshore")) return "Offshore flow";
  return "Coastal";
}

/** Longest contiguous run of windy months on the 12-month circle → "Jun–Sep". */
function seasonLabel(windy: number[]): string | null {
  if (windy.length === 0) return null;
  if (windy.length >= 11) return "Year-round";
  const set = new Set(windy);
  let bestStart = windy[0], bestLen = 0;
  for (const s of windy) {
    if (set.has((s - 2 + 12) % 12 + 1)) continue; // not a run start
    let len = 0, cur = s;
    while (set.has(cur)) { len++; cur = (cur % 12) + 1; }
    if (len > bestLen) { bestLen = len; bestStart = s; }
  }
  const end = ((bestStart - 1 + bestLen - 1) % 12) + 1;
  return bestLen === 1 ? MONTH_LABELS[bestStart - 1] : `${MONTH_LABELS[bestStart - 1]}–${MONTH_LABELS[end - 1]}`;
}

/**
 * Wind statistics, the NP7 way — a cleaner take on Windguru's monthly bars.
 * Stacked cumulative Beaufort bands (strongest at the bottom), a real % axis,
 * a hover read-out per month, and a plain-English "best wind / warmest" summary
 * the raw Windguru chart never gives you.
 */
export function WindStatsChart({ stats, compact = false, accent = "#00afdb" }: { stats: WindStats; compact?: boolean; accent?: string }) {
  const [hi, setHi] = useState<number | null>(null);
  // Model switcher: `stats` = standard coastal read, `stats.alt` = the
  // offshore/accelerated read (present only when the two disagree).
  const [model, setModel] = useState<"main" | "alt">("main");
  const view = model === "alt" && stats.alt ? stats.alt : stats;
  const H = compact ? 130 : 176;
  const season = seasonLabel(view.summary?.windyMonths ?? []);
  const warm = view.summary?.warmestMonth;
  // Single windiest month — most planing wind (4+ Bft, tie-break 3+). Derived
  // live so it works even for stats cached before this was added.
  const windiest = (() => {
    let best = -1, m: number | null = null;
    for (const x of view.months) { const s = (x.pct["4"] ?? 0) * 100 + (x.pct["3"] ?? 0); if (s > best) { best = s; m = x.m; } }
    return m;
  })();

  const bands = (m: WindStats["months"][number]) => {
    const p = (b: number) => m.pct[String(b)] ?? 0;
    let base = 0;
    return [7, 6, 5, 4, 3].map((b) => {
      const cum = p(b), seg = Math.max(cum - base, 0);
      const band = { bft: b, bottom: base, height: seg, cum, color: BFT_META.find((x) => x.bft === b)!.color };
      base = cum;
      return band;
    });
  };

  return (
    <div>
      {/* model switcher — both reads are stored, so the rider can compare the
          coastal-pin read with the offshore/accelerated flow on demand. */}
      {stats.alt && (
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#b3a994] mb-1">Model read · tap to compare</div>
          <div className="flex items-center gap-1 rounded-full bg-[#f1ede3] p-1 w-fit" role="tablist" aria-label="Wind model">
            {([["main", modelLabel(stats.source)], ["alt", modelLabel(stats.alt.source)]] as const).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={model === k}
                onClick={() => setModel(k)}
                className={`px-3 py-1 rounded-full text-[11.5px] font-bold transition-colors ${
                  model === k ? "bg-white text-[#00374a] shadow-sm" : "text-[#8a9aa0] hover:text-[#00374a]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* smart summary */}
      {!compact && (season || warm || windiest) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {season && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#00374a] bg-white border border-[#ece3d3] rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full" style={{ background: accent }} />Best wind · {season}
            </span>
          )}
          {windiest != null && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#00374a] bg-white border border-[#ece3d3] rounded-full px-3 py-1">
              💨 Windiest · {MONTH_LABELS[windiest - 1]}
            </span>
          )}
          {warm != null && view.summary?.warmestTemp != null && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#00374a] bg-white border border-[#ece3d3] rounded-full px-3 py-1">
              ☀ Warmest · {MONTH_LABELS[warm - 1]} {view.summary.warmestTemp}°
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {/* y-axis */}
        <div className="relative shrink-0 w-6" style={{ height: H }}>
          {[100, 75, 50, 25, 0].map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2 text-[9px] font-semibold text-[#b3a994]" style={{ top: `${100 - v}%` }}>{v}</span>
          ))}
        </div>

        {/* plot */}
        <div className="relative flex-1 min-w-0" style={{ height: H }}>
          {[0, 25, 50, 75, 100].map((v) => (
            <div key={v} className="absolute left-0 right-0 border-t border-dashed border-[#ece3d3]" style={{ top: `${100 - v}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
            {view.months.map((m) => {
              const on = hi === m.m;
              return (
                <button key={m.m} type="button" onMouseEnter={() => setHi(m.m)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(m.m)} onClick={() => setHi(on ? null : m.m)}
                  className="relative flex-1 h-full rounded-t-md overflow-hidden bg-[#f1f4f5] transition-[filter] cursor-default" style={{ filter: on ? "saturate(1.2)" : hi ? "saturate(0.7) opacity(0.75)" : "none" }}>
                  {bands(m).map((b) => b.height > 0 && (
                    <span key={b.bft} className="absolute left-0 right-0" style={{ bottom: `${b.bottom}%`, height: `${b.height}%`, backgroundColor: b.color, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)" }} />
                  ))}
                </button>
              );
            })}
          </div>

          {/* hover read-out */}
          {hi != null && (() => {
            const m = view.months[hi - 1];
            return (
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-10 w-[150px] rounded-lg bg-[#00374a] text-white p-2.5 shadow-lg pointer-events-none">
                <div className="flex items-center justify-between text-[11px] font-bold mb-1.5"><span>{MONTH_LABELS[hi - 1]}</span><span className="text-white/70">{m.avgWind} kn avg{m.airTemp != null ? ` · ${m.airTemp}°` : ""}</span></div>
                {[3, 4, 5, 6, 7].map((b) => (
                  <div key={b} className="flex items-center gap-1.5 text-[10.5px] leading-[1.5]">
                    <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: BFT_META.find((x) => x.bft === b)!.color }} />
                    <span className="text-white/70">{b}+ Bft</span><span className="ml-auto font-semibold">{m.pct[String(b)] ?? 0}%</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* month labels */}
      <div className="flex gap-[3px] sm:gap-1.5 mt-1.5 pl-8">
        {view.months.map((m) => (
          <div key={m.m} className="flex-1 text-center">
            <div className={`text-[9.5px] sm:text-[10.5px] font-bold ${hi === m.m ? "text-[#00374a]" : "text-[#9aa6ac]"}`}>{MONTH_LABELS[m.m - 1][0]}</div>
            {!compact && m.airTemp != null && <div className="text-[9px] text-[#c3b9a6]">{m.airTemp}°</div>}
          </div>
        ))}
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        {BFT_META.map((b) => (
          <span key={b.bft} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5a6b72]">
            <span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: b.color }} />{b.label}
          </span>
        ))}
        <span className="text-[10.5px] text-[#9aa6ac] ml-auto">
          {(view.source ?? "").startsWith("NP7")
            ? <>% planing days · {view.source}</>
            : <>% of sailing hours (09–18) · {view.source} · modeled</>}
        </span>
      </div>
      {!(view.source ?? "").startsWith("NP7") && (
        <p className="text-[10px] text-[#b3a994] mt-1 leading-snug">Modeled estimate — coarse models can under-read wind-acceleration spots (Canaries, Tarifa…).</p>
      )}
    </div>
  );
}
