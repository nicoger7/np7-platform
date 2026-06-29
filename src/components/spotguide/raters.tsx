"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { type Criterion, FORECAST_MODELS, FORECAST_TIER_LABEL, type ForecastTier } from "@/lib/spotguide";

/** Clickable 0–5 stars. */
function Stars({ value, onPick, accent = "#1f9e57" }: { value: number; onPick: (n: number) => void; accent?: string }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex items-center" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onMouseEnter={() => setHover(n)} onClick={() => onPick(n === value ? 0 : n)}
          className="text-[18px] leading-none px-0.5" style={{ color: n <= (hover || value) ? accent : "#dcd3c2" }} aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>
      ))}
    </span>
  );
}

/** "Your rating" — per-criterion stars + save. Works for a spot or the destination. */
export function CriteriaRater({ target, id, criteria, accent = "#00afdb" }: { target: "spot" | "destination"; id: string; criteria: Criterion[]; accent?: string }) {
  const sg = useSpotguide();
  const saved = target === "spot" ? sg.mineSpot(id)?.ratings : sg.mineDest;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { setDraft(saved ?? {}); }, [saved]);

  const hasAny = Object.values(draft).some((n) => n > 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? {});

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    if (!hasAny) return;
    setBusy(true);
    const res = target === "spot" ? await sg.saveSpot(id, draft) : await sg.saveDest(draft);
    setBusy(false);
    if (res) { setDone(true); setTimeout(() => setDone(false), 2200); }
  }

  return (
    <div className="rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#9aa6ac]">{saved ? "Your rating" : "Rate it yourself"}</span>
        {!sg.loggedIn && <span className="text-[11px] text-[#9aa6ac]">free · takes seconds</span>}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0.5">
        {criteria.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 py-0.5" title={c.hint}>
            <span className="text-[13px] font-semibold text-[#5a6b72]">{c.label}</span>
            <Stars value={draft[c.key] ?? 0} onPick={(n) => setDraft((d) => ({ ...d, [c.key]: n }))} accent={accent} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={submit} disabled={busy || (sg.loggedIn && (!hasAny || !dirty))}
          className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: accent }}>
          {busy ? "Saving…" : !sg.loggedIn ? "Sign up to rate" : saved ? "Update rating" : "Submit rating"}
        </button>
        {done && <span className="text-[12.5px] font-bold" style={{ color: "#1f9e57" }}>Saved — thanks! 🤙</span>}
      </div>
    </div>
  );
}

/** Vote your most-accurate forecast model for a spot. */
export function ForecastVoter({ spotId, accent = "#00afdb" }: { spotId: string; accent?: string }) {
  const sg = useSpotguide();
  const mine = sg.mineSpot(spotId)?.model;
  const [busy, setBusy] = useState<string | null>(null);

  async function vote(model: string) {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    setBusy(model);
    await sg.voteForecast(spotId, model);
    setBusy(null);
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#f0e9da]">
      <p className="text-[12px] font-semibold text-[#5a6b72] mb-2">
        Which forecast nails it here? <span className="text-[#9aa6ac] font-normal">Vote the model you trust.</span>
      </p>
      <div className="space-y-2">
        {(["global", "highres", "app"] as ForecastTier[]).map((tier) => (
          <div key={tier}>
            <p className="text-[10px] uppercase tracking-wide text-[#b3a994] mb-1">{FORECAST_TIER_LABEL[tier]}</p>
            <div className="flex flex-wrap gap-1.5">
              {FORECAST_MODELS.filter((m) => m.tier === tier).map((m) => {
                const on = mine === m.id;
                return (
                  <button key={m.id} onClick={() => vote(m.id)} disabled={busy === m.id} title={m.note}
                    className="px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors disabled:opacity-50"
                    style={on ? { backgroundColor: accent, color: "#fff" } : { border: "1px solid #e2d8c6", color: "#5a6b72" }}>
                    {on ? "✓ " : ""}{m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
