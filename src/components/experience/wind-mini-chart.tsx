"use client";

import { MONTH_LABELS, statsAreBlind, type WindStats } from "@/lib/wind-stats";

/**
 * The tiny wind graph on a trip page — three months around the trip, measured.
 *
 * Replaces the hand-typed "85–95% wind probability", which was a number nobody
 * could source. This is the share of days with real sailing wind (11+ kn,
 * 09–18h) from Open-Meteo's ERA5 reanalysis — the accelerated read, sampled
 * where the venturi spots actually blow — with the source printed underneath
 * so a guest can see it isn't us inventing it.
 */
export function WindMiniChart({
  stats,
  centerMonth,
  monthsByEdition,
}: {
  stats: WindStats;
  /** Months of the default week — used until a week is picked. */
  centerMonth: number | number[];
  /** Every week's months, so the graph follows the week the visitor selects. */
  monthsByEdition?: Record<string, number[]>;
}) {
  // Highlight the months of the WHOLE experience, not the selected week.
  // Following the selection meant the default week lit August alone while the
  // trip genuinely reaches into September — a guest comparing weeks reads this
  // chart as "when does this trip blow", not "when does my current selection
  // blow". Union across every week; the server-provided months are the fallback.
  const all = monthsByEdition ? [...new Set(Object.values(monthsByEdition).flat())] : [];
  const fallback = Array.isArray(centerMonth) ? centerMonth : [centerMonth];
  const tripMonths = (all.length ? all : fallback)
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b);
  const anchor = tripMonths[0] ?? 1;
  const last = tripMonths[tripMonths.length - 1] ?? anchor;
  // Window: the month before the trip starts through the month after it ends,
  // so a two-month week shows both of its own months plus one on each side.
  const pick: number[] = [((anchor + 10) % 12) + 1];
  for (const m of tripMonths) if (!pick.includes(m)) pick.push(m);
  const after = (last % 12) + 1;
  if (!pick.includes(after)) pick.push(after);
  const rows = pick.map((m) => {
    const mm = stats.months?.find((x) => x.m === m);
    // Day-window metric where the cache has it; hours-share as fallback until
    // the destination's stats are refetched.
    const pct = Math.round(Number(mm?.dayPct ?? (mm?.pct as Record<string, number> | undefined)?.["4"] ?? 0));
    return { m, label: MONTH_LABELS[m - 1], pct, center: tripMonths.includes(m) };
  });
  if (rows.every((r) => r.pct === 0)) return null;
  if (statsAreBlind(stats)) return null; // model can't see this spot — say nothing rather than 2%

  const years = stats.period
    ? `${String(stats.period.start).slice(0, 4)}–${String(stats.period.end).slice(0, 4)}`
    : "";

  return (
    <div className="mt-6">
      <div className="flex items-end gap-4 h-[92px]">
        {rows.map((r) => (
          <div key={r.m} className="flex flex-col items-center justify-end gap-1 flex-1 max-w-[84px] h-full">
            <span className={`text-[12.5px] font-bold tabular-nums ${r.center ? "text-[#00374a]" : "text-[#7a8a90]"}`}>{r.pct}%</span>
            <div
              className={`w-full rounded-t-md ${r.center ? "bg-[#00afdb]" : "bg-[#00afdb]/30"}`}
              style={{ height: `${Math.max(6, r.pct * 0.6)}px` }}
            />
            <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${r.center ? "text-[#00374a]" : "text-[#9aa6ac]"}`}>{r.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#9aa6ac] mt-2 leading-snug">
        Days with a real session window — 2h+ of 11+ kn wind (or 16+ kn gusts), 11–19h. Source: Open-Meteo {years} — measured, not our estimate.
      </p>
    </div>
  );
}
