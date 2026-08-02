import { MONTH_LABELS, type WindStats } from "@/lib/wind-stats";

/**
 * The tiny wind graph on a trip page — three months around the trip, measured.
 *
 * Replaces the hand-typed "85–95% wind probability", which was a number nobody
 * could source. This is the share of days with real sailing wind (11+ kn,
 * 09–18h) from Open-Meteo's ERA5 reanalysis — the accelerated read, sampled
 * where the venturi spots actually blow — with the source printed underneath
 * so a guest can see it isn't us inventing it.
 */
export function WindMiniChart({ stats, centerMonth }: { stats: WindStats; centerMonth: number }) {
  const pick = [((centerMonth + 10) % 12) + 1, centerMonth, ((centerMonth) % 12) + 1];
  const rows = pick.map((m) => {
    const mm = stats.months?.find((x) => x.m === m);
    const pct = Math.round(Number((mm?.pct as Record<string, number> | undefined)?.["4"] ?? 0));
    return { m, label: MONTH_LABELS[m - 1], pct, center: m === centerMonth };
  });
  if (rows.every((r) => r.pct === 0)) return null;

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
        Days with sailing wind (11+ kn, 09–18h). Source: Open-Meteo, ERA5 reanalysis {years} — measured, not our estimate.
      </p>
    </div>
  );
}
