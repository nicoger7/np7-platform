"use client";

import { forecastLabel, forecastModel, type ForecastTally } from "@/lib/spotguide";
import { ForecastVoter } from "./raters";

/**
 * "Best forecast here." NP7's recommended model(s) + the crowd vote rendered
 * like the windrose: colour + placement show which model riders trust most, so
 * "most likely correct" reads at a glance. The VOTER lives right here too and
 * the panel renders on EVERY spot — members kept missing the vote when it was
 * buried in the contribute fold and hidden entirely on spots without NP7 models.
 */
export function ForecastPanel({ spotId, np7Models, tally, accent = "#00afdb" }: { spotId: string; np7Models: string[]; tally: ForecastTally[]; accent?: string }) {
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
        <p className="text-[12px] text-[#9aa6ac]">No votes yet — be the first.</p>
      )}

      {/* vote right where the result shows — your pick is ticked, tap to change */}
      <ForecastVoter spotId={spotId} accent={accent} />
    </div>
  );
}
