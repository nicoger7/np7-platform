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

/** Per-criterion breakdown: NP7 stars + member average side by side. */
export function RatingBreakdown({ criteria, np7Ratings, member }: { criteria: Criterion[]; np7Ratings: Record<string, number>; member: RatingSummary }) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
      {criteria.map((c) => {
        const np7 = np7Ratings[c.key] ?? 0;
        const mem = member.byCriterion[c.key] ?? 0;
        if (!np7 && !mem) return null;
        return (
          <div key={c.key} className="flex items-center justify-between gap-3 py-0.5" title={c.hint}>
            <span className="text-[13px] font-semibold text-[#5a6b72]">{c.label}</span>
            <span className="flex items-center gap-3">
              {np7 > 0 && <Stars value={np7} size={13} />}
              {mem > 0 && <span className="text-[12px] font-bold text-[#1f9e57]">{mem.toFixed(1)}<span className="text-[#9aa6ac] font-normal">·m</span></span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
