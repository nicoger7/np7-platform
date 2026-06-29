import { forecastLabel, forecastModel, type ForecastTally } from "@/lib/spotguide";

/**
 * "Best forecast here." NP7's recommended model(s) + the crowd vote rendered
 * like the windrose: colour + placement show which model riders trust most, so
 * "most likely correct" reads at a glance. (Voting itself arrives in Phase 2.)
 */
export function ForecastPanel({ np7Models, tally, accent = "#00afdb" }: { np7Models: string[]; tally: ForecastTally[]; accent?: string }) {
  if (np7Models.length === 0 && tally.length === 0) return null;
  const top = tally[0];
  return (
    <div className="rounded-xl bg-[#fdfaf3] border border-[#f0e9da] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Best forecast here</div>

      {np7Models.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${accent}1a`, color: accent }}>NP7</span>
          {np7Models.map((id) => (
            <span key={id} className="text-[12.5px] font-bold text-[#00374a] bg-white border border-[#ece3d3] rounded-full px-2.5 py-1" title={forecastModel(id)?.note}>{forecastLabel(id)}</span>
          ))}
        </div>
      )}

      {tally.length > 0 ? (
        <div>
          <p className="text-[12px] text-[#6a7a80] mb-2">
            Riders trust <b className="text-[#00374a]">{top.label}</b> most here{top.pct ? ` (${top.pct}% of votes)` : ""}.
          </p>
          <div className="space-y-1.5">
            {tally.map((t, i) => (
              <div key={t.model} className="flex items-center gap-2">
                <span className="w-24 sm:w-28 shrink-0 text-[12.5px] font-semibold truncate" style={{ color: i === 0 ? "#1f9e57" : "#5a6b72" }}>{t.label}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-[#e7ecee]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(t.pct, 4)}%`, backgroundColor: i === 0 ? "#1f9e57" : "#9bb0a4" }} />
                </div>
                <span className="w-10 text-right text-[11.5px] text-[#9aa6ac]">{t.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-[#9aa6ac]">In most wind apps you can choose which forecast model to display. Members vote the one they trust most here — be the first.</p>
      )}
    </div>
  );
}
