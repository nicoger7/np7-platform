"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { WindroseInput } from "./windrose-input";
import {
  type Criterion, FORECAST_MODELS, FORECAST_TIER_LABEL, type ForecastTier,
  SPOT_CRITERIA, LEVELS, CONDITIONS, windWindowHasValue, asWindWindow,
} from "@/lib/spotguide";

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

function StarRows({ criteria, value, onPick, accent }: { criteria: Criterion[]; value: Record<string, number>; onPick: (k: string, n: number) => void; accent: string }) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0.5">
      {criteria.map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-2 py-0.5" title={c.hint}>
          <span className="text-[13px] font-semibold text-[#5a6b72]">{c.label}</span>
          <Stars value={value[c.key] ?? 0} onPick={(n) => onPick(c.key, n)} accent={accent} />
        </div>
      ))}
    </div>
  );
}

/** Destination rating — star criteria only (wind is the spots' objective climatology). */
export function DestinationRater({ criteria, accent = "#00afdb" }: { criteria: Criterion[]; accent?: string }) {
  const sg = useSpotguide();
  const saved = sg.mineDest;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setDraft(saved ?? {}); }, [saved]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? {});
  const hasAny = Object.values(draft).some((n) => n > 0);

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    if (!hasAny) return;
    setBusy(true);
    const res = await sg.saveDest(draft);
    setBusy(false);
    if (res) { setDone(true); setTimeout(() => setDone(false), 2200); }
  }

  return (
    <div className="rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#9aa6ac]">{saved ? "Your rating" : "Rate it yourself"}</span>
        {!sg.loggedIn && <span className="text-[11px] text-[#9aa6ac]">free · takes seconds</span>}
      </div>
      <StarRows criteria={criteria} value={draft} onPick={(k, n) => setDraft((d) => ({ ...d, [k]: n }))} accent={accent} />
      <div className="flex items-center gap-3 mt-3">
        <button onClick={submit} disabled={busy || (sg.loggedIn && (!hasAny || !dirty))} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-40 transition-opacity" style={{ backgroundColor: accent }}>
          {busy ? "Saving…" : !sg.loggedIn ? "Sign up to rate" : saved ? "Update rating" : "Submit rating"}
        </button>
        {done && <span className="text-[12.5px] font-bold" style={{ color: "#1f9e57" }}>Saved — thanks! 🤙</span>}
      </div>
    </div>
  );
}

/** Spot "your visit" — the facts a member actually knows (level it suits, the
    conditions they saw, the wind directions that worked) plus season-independent
    stars. Wind is NOT rated here (that's the objective climatology chart). */
export function SpotVisitRater({ spotId, accent = "#00afdb" }: { spotId: string; accent?: string }) {
  const sg = useSpotguide();
  const mine = sg.mineSpot(spotId);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [level, setLevel] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [wind, setWind] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const mineKey = JSON.stringify(mine ?? null);
  useEffect(() => {
    setRatings(mine?.ratings ?? {}); setLevel(mine?.level ?? "");
    setConditions(mine?.conditions ?? []); setWind(mine?.wind_window ?? {});
  }, [mineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAny = Object.values(ratings).some((n) => n > 0) || !!level || conditions.length > 0 || windWindowHasValue(asWindWindow(wind));

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    if (!hasAny) return;
    setBusy(true);
    const ok = await sg.saveSpot(spotId, { ratings, level: level || null, conditions, wind_window: wind });
    setBusy(false);
    if (ok) { setDone(true); setTimeout(() => setDone(false), 2400); }
  }

  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${on ? "text-white" : "text-[#5a6b72] border border-[#e2d8c6]"}`;

  return (
    <div className="rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#9aa6ac]">{mine ? "Your visit" : "Been here? Add what you know"}</span>
        {!sg.loggedIn && <span className="text-[11px] text-[#9aa6ac]">free · takes seconds</span>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Level it suits</p>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#e2d8c6] text-[14px] text-[#00374a] bg-white outline-none focus:border-[#9aa6ac]">
            <option value="">—</option>{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Conditions you saw</p>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => {
              const on = conditions.includes(c.key);
              return <button key={c.key} type="button" onClick={() => setConditions((p) => on ? p.filter((x) => x !== c.key) : [...p, c.key])} className={chip(on)} style={on ? { backgroundColor: accent } : undefined}>{c.label}</button>;
            })}
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Wind directions that worked</p>
        <WindroseInput value={wind} onChange={setWind} />
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Rate it</p>
        <StarRows criteria={SPOT_CRITERIA} value={ratings} onPick={(k, n) => setRatings((r) => ({ ...r, [k]: n === (r[k] ?? 0) ? 0 : n }))} accent={accent} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy || (sg.loggedIn && !hasAny)} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-40 transition-opacity" style={{ backgroundColor: accent }}>
          {busy ? "Saving…" : !sg.loggedIn ? "Sign up to add" : mine ? "Update" : "Add my knowledge"}
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
      <p className="text-[12px] font-semibold text-[#5a6b72] mb-2">Which forecast nails it here? <span className="text-[#9aa6ac] font-normal">Vote the model you trust.</span></p>
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
