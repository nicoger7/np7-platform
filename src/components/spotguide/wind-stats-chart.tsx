import { BFT_META, MONTH_LABELS, type WindStats } from "@/lib/wind-stats";

/**
 * Windguru-style monthly wind statistics. Each month is a stacked bar; from the
 * bottom up the bands are the strongest-wind share first (7+ Bft) to lightest
 * (3+ Bft), so the coloured boundaries read as cumulative "% of daytime hours
 * with at least this much wind". The total bar height = % of hours ≥ 3 Bft.
 */
export function WindStatsChart({ stats, compact = false }: { stats: WindStats; compact?: boolean }) {
  const H = compact ? 130 : 168;
  // Band boundaries from bottom: 7+ (p7), 6+ (p6) … 3+ (p3). Heights = differences.
  const bands = (m: WindStats["months"][number]) => {
    const p = (b: number) => m.pct[String(b)] ?? 0;
    const order = [7, 6, 5, 4, 3]; // bottom → top
    let base = 0;
    return order.map((b) => {
      const cum = p(b);                 // cumulative % ≥ this Bft
      const seg = Math.max(cum - base, 0);
      const band = { bft: b, bottom: base, height: seg, cum, color: BFT_META.find((x) => x.bft === b)!.color };
      base = cum;
      return band;
    });
  };

  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-1.5">
        {stats.months.map((m) => (
          <div key={m.m} className="flex-1 min-w-0">
            <div className="relative w-full" style={{ height: H }}>
              {bands(m).map((b) => (
                b.height > 0 && (
                  <div key={b.bft} className="absolute left-0 right-0 rounded-[2px]"
                    style={{ bottom: `${b.bottom}%`, height: `${b.height}%`, backgroundColor: b.color }}
                    title={`${b.cum}% ≥ ${b.bft} Bft`} />
                )
              ))}
            </div>
            <div className="text-center text-[10px] sm:text-[11px] font-bold text-[#6a7a80] mt-1">{MONTH_LABELS[m.m - 1]}</div>
            {!compact && m.airTemp != null && <div className="text-center text-[10px] text-[#b0a890]">{m.airTemp}°</div>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        {BFT_META.map((b) => (
          <span key={b.bft} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5a6b72]">
            <span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: b.color }} />{b.label}
          </span>
        ))}
        <span className="text-[11px] text-[#9aa6ac] ml-auto">% of daytime hours · {stats.source}</span>
      </div>
    </div>
  );
}
