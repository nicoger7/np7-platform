"use client";

import { useState } from "react";
import type { Survey, SurveyResponse } from "@/lib/surveys";

/**
 * The member-facing trip-interest form (reached only via a secret token link).
 * Questions: top destination (+ also-up-for) from the survey's shortlist, which
 * of the allowed weeks work, a budget comfort RANGE anchored on the target, and
 * what they want from the trip. Submits to /api/survey/[token].
 */
export function SurveyForm({ survey, token, contactName, existing, preview = false }: {
  survey: Survey; token: string; contactName: string | null; existing: SurveyResponse | null; preview?: boolean;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: survey.currency || "EUR", maximumFractionDigits: 0 }).format(n);
  const step = 250;
  const clampStep = (n: number) => Math.round(n / step) * step;
  const lo0 = existing?.budget_min ?? (survey.budget_anchor ? Math.max(survey.budget_min, clampStep(survey.budget_anchor * 0.9)) : survey.budget_min);
  const hi0 = existing?.budget_max ?? (survey.budget_anchor ? Math.min(survey.budget_max, clampStep(survey.budget_anchor * 1.1)) : clampStep((survey.budget_min + survey.budget_max) / 2));

  const [topDest, setTopDest] = useState<string | null>(existing?.top_destination ?? null);
  const [alsoDest, setAlsoDest] = useState<Set<string>>(new Set(existing?.other_destinations ?? []));
  const [weeks, setWeeks] = useState<Set<string>>(new Set(existing?.weeks ?? []));
  const [budLo, setBudLo] = useState<number>(lo0);
  const [budHi, setBudHi] = useState<number>(hi0);
  const [lookingFor, setLookingFor] = useState(existing?.looking_for ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n; };

  async function submit() {
    setErr("");
    if (survey.destinations.length > 0 && !topDest) { setErr("Pick your top choice of spot."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          top_destination: topDest,
          other_destinations: [...alsoDest].filter((k) => k !== topDest),
          weeks: [...weeks],
          budget_min: Math.min(budLo, budHi),
          budget_max: Math.max(budLo, budHi),
          looking_for: lookingFor.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Couldn't submit — please try again."); return; }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[#bfe6d7] bg-[#f1faf5] p-8 text-center">
        <div className="text-4xl mb-2">🤙</div>
        <h2 className="text-[20px] font-black text-[#00374a]">Thank you{contactName ? `, ${contactName.split(/\s+/)[0]}` : ""}!</h2>
        <p className="text-[14px] text-[#5a6b72] mt-2 max-w-[420px] mx-auto">Your answers are in. This really helps me shape the trip — I&apos;ll be in touch if it comes together. 🌊</p>
      </div>
    );
  }

  const card = "rounded-2xl border border-[#ecdcbb] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(120,90,20,0.05)]";
  const label = "text-[12px] font-black uppercase tracking-[0.16em] text-[#b0791e]";

  return (
    <div className="space-y-4">
      {/* Destinations */}
      {survey.destinations.length > 0 && (
        <div className={card}>
          <p className={label}>Where would you want to go?</p>
          <p className="text-[13px] text-[#8a97a0] mt-1 mb-3">Pick your top choice.</p>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {survey.destinations.map((d) => {
              const on = topDest === d.key;
              return (
                <button key={d.key} type="button" onClick={() => setTopDest(d.key)}
                  className={`text-left rounded-xl border-2 px-4 py-3.5 font-bold text-[15px] transition-colors ${on ? "border-[#f0a500] bg-[#fff7e6] text-[#00374a] shadow-[0_6px_18px_rgba(240,165,0,0.14)]" : "border-[#ecdcbb] bg-white text-[#3a4a50] hover:border-[#f2cf8a]"}`}>
                  <span className="flex items-center justify-between gap-2">
                    {d.label}
                    {on && <span className="text-[11px] font-black" style={{ color: "#b0791e" }}>★ TOP PICK</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {survey.destinations.length > 1 && (
            <div className="mt-4">
              <p className="text-[12.5px] font-bold text-[#6a7a80] mb-2">Others you&apos;d also be up for (optional)</p>
              <div className="flex flex-wrap gap-2">
                {survey.destinations.filter((d) => d.key !== topDest).map((d) => {
                  const on = alsoDest.has(d.key);
                  return (
                    <button key={d.key} type="button" onClick={() => setAlsoDest((s) => toggle(s, d.key))}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${on ? "border-[#e0992a] bg-[#fff2d8] text-[#8a5e12]" : "border-[#e7ddcb] bg-white text-[#3a4a50] hover:border-[#e0992a]"}`}>
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weeks */}
      {survey.weeks.length > 0 && (
        <div className={card}>
          <p className={label}>When could you go?</p>
          <p className="text-[13px] text-[#8a97a0] mt-1 mb-3">Tick every week that could work — the more the better.</p>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {survey.weeks.map((w) => {
              const on = weeks.has(w.key);
              return (
                <button key={w.key} type="button" onClick={() => setWeeks((s) => toggle(s, w.key))}
                  className={`text-left rounded-xl border-2 px-4 py-3 transition-colors ${on ? "border-[#f0a500] bg-[#fff7e6]" : "border-[#ecdcbb] bg-white hover:border-[#f2cf8a]"}`}>
                  <span className="block font-bold text-[14.5px] text-[#00374a]">{w.label}</span>
                  {(w.start || w.end) && <span className="block text-[12.5px] text-[#a58a5e] mt-0.5">{[w.start, w.end].filter(Boolean).join(" – ")}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget range */}
      <div className={card}>
        <p className={label}>What&apos;s your comfortable budget?</p>
        {survey.budget_anchor ? (
          <p className="text-[13px] text-[#8a97a0] mt-1 mb-4">This trip would land around <strong className="text-[#00374a]">{fmt(survey.budget_anchor)}</strong>. Set the range you&apos;d be comfortable with.</p>
        ) : (
          <p className="text-[13px] text-[#8a97a0] mt-1 mb-4">Set the range you&apos;d be comfortable spending on this trip.</p>
        )}
        <div className="text-center text-[22px] font-black text-[#00374a] mb-3">{fmt(Math.min(budLo, budHi))} <span className="text-[#c0ccd0]">–</span> {fmt(Math.max(budLo, budHi))}</div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] font-bold text-[#6a7a80]">Comfortable from</span>
            <input type="range" min={survey.budget_min} max={survey.budget_max} step={step} value={budLo}
              onChange={(e) => setBudLo(Number(e.target.value))} className="w-full accent-[#e0992a]" />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-[#6a7a80]">up to</span>
            <input type="range" min={survey.budget_min} max={survey.budget_max} step={step} value={budHi}
              onChange={(e) => setBudHi(Number(e.target.value))} className="w-full accent-[#e0992a]" />
          </label>
        </div>
      </div>

      {/* Looking for */}
      <div className={card}>
        <p className={label}>What are you looking for in this trip?</p>
        <p className="text-[13px] text-[#8a97a0] mt-1 mb-3">Coaching, wind guarantee, a chill vibe, luxury, exploration… tell me what would make it perfect for you.</p>
        <textarea value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} rows={4}
          placeholder="In your words…"
          className="w-full rounded-xl border border-[#d8e3e6] px-3.5 py-3 text-[15px] outline-none focus:border-[#00afdb] transition-colors resize-y" />
      </div>

      {err && <p className="text-[13px] text-[#c0392b] font-semibold">{err}</p>}
      {preview ? (
        <div className="w-full rounded-full text-center text-[14px] font-bold py-4 bg-[#f0e6d6] text-[#8a7a5e]">Preview — members send their answers from here</div>
      ) : (
        <button type="button" onClick={submit} disabled={busy}
          className="w-full rounded-full text-white text-[15.5px] font-black py-4 disabled:opacity-50 transition-transform hover:-translate-y-0.5 shadow-[0_12px_30px_rgba(240,123,32,0.26)]"
          style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
          {busy ? "Sending…" : existing ? "Update my answers" : "Send my answers"}
        </button>
      )}
      <p className="text-[12px] text-[#a58a5e] text-center">Private — only Nico &amp; the NP7 team see this.</p>
    </div>
  );
}
