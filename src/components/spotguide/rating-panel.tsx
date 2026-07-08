import { type Criterion, type RatingSummary } from "@/lib/spotguide";

/** Five stars filled to `value` (supports halves via a clip). */
function Stars({ value, color = "#f5a623", size = 15 }: { value: number; color?: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="relative inline-block leading-none align-middle" style={{ fontSize: size }} aria-label={`${value.toFixed(1)} of 5`}>
      <span className="text-[#e4ddcd]">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden whitespace-nowrap" style={{ width: `${pct}%`, color }}>★★★★★</span>
    </span>
  );
}

/** The headline dual-track score: NP7 (authoritative) + member average. */
export function RatingHeadline({ np7, member, accent = "#00afdb" }: { np7: number; member: RatingSummary; accent?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {np7 > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${accent}1a`, color: accent }}>NP7</span>
          <Stars value={np7} /><span className="text-[13px] font-bold text-[#00374a]">{np7.toFixed(1)}</span>
        </span>
      )}
      {member.count > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#9aa6ac]">Members</span>
          <Stars value={member.overall} color="#1f9e57" /><span className="text-[13px] font-bold text-[#00374a]">{member.overall.toFixed(1)}</span>
          <span className="text-[12px] text-[#9aa6ac]">({member.count})</span>
        </span>
      ) : (
        <span className="text-[12px] text-[#9aa6ac]">No member ratings yet</span>
      )}
    </div>
  );
}

/** Per-criterion breakdown — a clean scored bar per criterion (NP7 = gold, or
    member average = green when NP7 hasn't rated it). */
export function RatingBreakdown({ criteria, np7Ratings, member }: { criteria: Criterion[]; np7Ratings: Record<string, number>; member: RatingSummary }) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3.5">
      {criteria.map((c) => {
        const np7 = np7Ratings[c.key] ?? 0;
        const mem = member.byCriterion[c.key] ?? 0;
        if (!np7 && !mem) return null;
        const hasNp7 = np7 > 0;
        const val = hasNp7 ? np7 : mem;
        const color = hasNp7 ? "#f5a623" : "#1f9e57";
        // Price level reads as $ glyphs (5 $ = most expensive), not a score.
        const isPrice = c.key === "price";
        return (
          <div key={c.key} title={c.hint}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-semibold text-[#5a6b72]">{c.label}</span>
              <span className="inline-flex items-baseline gap-1.5">
                {isPrice ? (
                  <span className="text-[13px] font-black tracking-[0.06em]" aria-label={`Price level ${Math.round(val)} of 5`}>
                    <span style={{ color }}>{"$".repeat(Math.max(1, Math.round(val)))}</span>
                    <span className="text-[#dcd3c2]">{"$".repeat(5 - Math.max(1, Math.round(val)))}</span>
                  </span>
                ) : (
                  <span className="text-[14px] font-black tracking-tight" style={{ color }}>{val.toFixed(1)}</span>
                )}
                <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#b3a994]">{hasNp7 ? "NP7" : `${member.count} member${member.count === 1 ? "" : "s"}`}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#efe7d7] overflow-hidden">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${(val / 5) * 100}%`, backgroundColor: color }} />
            </div>
            {hasNp7 && mem > 0 && (
              <div className="mt-1 h-1 rounded-full bg-[#eef3ef] overflow-hidden" title={`Members: ${mem.toFixed(1)}`}>
                <div className="h-full rounded-full bg-[#1f9e57]" style={{ width: `${(mem / 5) * 100}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
