"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { WindroseInput } from "./windrose-input";
import { LevelPicker } from "./level-picker";
import {
  type Criterion, FORECAST_MODELS, FORECAST_TIER_LABEL, type ForecastTier,
  SPOT_CRITERIA, CONDITIONS, windWindowHasValue, asWindWindow,
} from "@/lib/spotguide";

/** Clickable 0–5 symbols (★ quality, $ price level). */
function Stars({ value, onPick, accent = "#1f9e57", symbol = "★" }: { value: number; onPick: (n: number) => void; accent?: string; symbol?: "★" | "$" }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex items-center" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onMouseEnter={() => setHover(n)} onClick={() => onPick(n === value ? 0 : n)}
          className={`leading-none px-0.5 ${symbol === "$" ? "text-[15px] font-black" : "text-[18px]"}`} style={{ color: n <= (hover || value) ? accent : "#dcd3c2" }}
          aria-label={symbol === "$" ? `Price level ${n} of 5` : `${n} star${n > 1 ? "s" : ""}`}>{symbol}</button>
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
          {/* price = cost level → $ glyphs (5 $ = most expensive); the rest = stars */}
          <Stars value={value[c.key] ?? 0} onPick={(n) => onPick(c.key, n)} accent={c.key === "price" ? "#1f9e57" : accent} symbol={c.key === "price" ? "$" : "★"} />
        </div>
      ))}
    </div>
  );
}

/** Destination rating — star criteria only (wind is the spots' objective
    climatology). Collapsed by default; goes quiet once rated and folds on save,
    so it never nags (mirrors the spot contribute block). */
export function DestinationRater({ criteria, accent = "#00afdb", defaults }: { criteria: Criterion[]; accent?: string; defaults?: Record<string, number> }) {
  const sg = useSpotguide();
  const saved = sg.mineDest;
  const rated = !!saved && Object.values(saved).some((n) => n > 0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Smart default: seed the stars from NP7's rating so it's one tap to agree (or
  // tweak) instead of rating from an empty slate. The member's own saved rating
  // always wins once they have one.
  const seededFromNp7 = !rated && !!defaults && Object.values(defaults).some((n) => n > 0);
  useEffect(() => { setDraft(saved ?? defaults ?? {}); }, [JSON.stringify(saved ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? {});
  const hasAny = Object.values(draft).some((n) => n > 0);

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    if (!hasAny) return;
    setBusy(true);
    const res = await sg.saveDest(draft);
    setBusy(false);
    if (res) { setDone(true); setTimeout(() => { setDone(false); setOpen(false); }, 1400); }
  }

  return (
    <div className={`rounded-2xl border overflow-hidden ${rated ? "border-[#ece3d3] bg-[#fdfaf3]" : "border-dashed border-[#d8cdbb] bg-[#fffdf8]"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-[#fdf8ee] transition-colors">
        <span className="min-w-0">
          {rated
            ? <span className="block text-[13.5px] font-bold text-[#1f9e57]">✓ You rated this destination</span>
            : <span className="block text-[14.5px] font-extrabold text-[#00374a]">★ Rate this destination</span>}
        </span>
        <span className={`shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold rounded-full px-4 py-2 ${rated ? "" : "text-white"}`}
          style={rated ? { color: accent, border: `1px solid ${accent}55` } : { backgroundColor: accent }}>
          {open ? "Close" : rated ? "Edit" : "Rate it"}
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 border-t border-[#f0e9da]">
          {seededFromNp7 && <p className="text-[12px] text-[#8a9aa0] mb-2.5">Starting from <b className="text-[#00374a]">NP7&apos;s rating</b> — tap the stars to adjust to yours.</p>}
          <StarRows criteria={criteria} value={draft} onPick={(k, n) => setDraft((d) => ({ ...d, [k]: n }))} accent={accent} />
          <div className="flex items-center gap-3 mt-3">
            <button onClick={submit} disabled={busy || (sg.loggedIn && (!hasAny || !dirty))} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-40 transition-opacity" style={{ backgroundColor: accent }}>
              {busy ? "Saving…" : !sg.loggedIn ? "Sign up to rate" : rated ? "Update rating" : "Submit rating"}
            </button>
            {done && <span className="text-[12.5px] font-bold" style={{ color: "#1f9e57" }}>Saved — thanks! 🤙</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Spot "your visit" — the facts a member actually knows (level it suits, the
    conditions they saw, the wind directions that worked) plus season-independent
    stars. Wind is NOT rated here (that's the objective climatology chart). */
export function SpotVisitRater({ spotId, accent = "#00afdb", onSaved, defaults }: { spotId: string; accent?: string; onSaved?: () => void; defaults?: Record<string, number> }) {
  const sg = useSpotguide();
  const mine = sg.mineSpot(spotId);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [level, setLevel] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [wind, setWind] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Seed stars from NP7's rating so it's one tap to agree/tweak (member's own wins).
  const seededFromNp7 = !mine?.ratings && !!defaults && Object.values(defaults).some((n) => n > 0);

  const mineKey = JSON.stringify(mine ?? null);
  useEffect(() => {
    setRatings(mine?.ratings ?? defaults ?? {}); setLevel(mine?.level ?? "");
    setConditions(mine?.conditions ?? []); setWind(mine?.wind_window ?? {});
  }, [mineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAny = Object.values(ratings).some((n) => n > 0) || !!level || conditions.length > 0 || windWindowHasValue(asWindWindow(wind));

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    if (!hasAny) return;
    setBusy(true);
    const ok = await sg.saveSpot(spotId, { ratings, level: level || null, conditions, wind_window: wind });
    setBusy(false);
    if (ok) { setDone(true); setTimeout(() => { setDone(false); onSaved?.(); }, 1400); }
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
          <LevelPicker value={level} onChange={setLevel} accent={accent} />
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
        {seededFromNp7 && <p className="text-[11.5px] text-[#8a9aa0] mb-1.5">Starting from <b className="text-[#00374a]">NP7&apos;s rating</b> — tap to adjust to yours.</p>}
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
      <p className="text-[12px] font-semibold text-[#5a6b72] mb-1">Which forecast nails it here? <span className="text-[#9aa6ac] font-normal">Vote the model you trust.</span></p>
      <p className="text-[11px] text-[#9aa6ac] mb-2 leading-snug">It&apos;s the forecast <b>model</b> — in any wind app (Windguru, Windy…) you can pick which one to show. Not sure? <b>GFS</b> is the safe global default; the high-res ones (ICON-D2, AROME…) are sharper at coastal &amp; thermal spots.</p>
      <div className="space-y-2">
        {(["global", "highres"] as ForecastTier[]).map((tier) => (
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
