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
  // Readable week dates: "20 – 27 Feb 2027" instead of raw ISO.
  const fmtDay = (s: string, withYear = false) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  const fmtWeek = (start: string | null, end: string | null) => (start && end ? `${fmtDay(start)} – ${fmtDay(end, true)}` : start || end ? fmtDay((start || end)!, true) : "");

  const [topDest, setTopDest] = useState<string | null>(existing?.top_destination ?? null);
  const [alsoDest, setAlsoDest] = useState<Set<string>>(new Set(existing?.other_destinations ?? []));
  const [weeks, setWeeks] = useState<Set<string>>(new Set(existing?.weeks ?? []));
  const [budgetOk, setBudgetOk] = useState<"yes" | "maybe" | "no" | null>(existing?.budget_ok ?? null);
  const [lookingFor, setLookingFor] = useState(existing?.looking_for ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set([...(existing?.top_destination ? [existing.top_destination] : []), ...(existing?.other_destinations ?? [])]));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Trip-cards mode: when the options carry dates they ARE the trips — members
  // multi-select which fixed date+place combos they'd join (no separate weeks).
  const hasTrips = survey.destinations.some((d) => !!(d.start || d.end));
  const byKey = new Map(survey.destinations.map((d) => [d.key, d]));
  // Group the trip rows by place so several date windows for the same place nest
  // as period pills under one card (each row stays its own selectable option).
  const tripGroups = (() => {
    const m = new Map<string, typeof survey.destinations>();
    for (const d of survey.destinations) {
      const name = (d.label || d.location || d.key).trim();
      if (!m.has(name)) m.set(name, []);
      m.get(name)!.push(d);
    }
    return [...m.entries()].map(([name, rows]) => ({
      key: rows[0].key, name,
      location: rows.find((r) => r.location)?.location ?? null,
      blurb: rows.find((r) => r.blurb)?.blurb ?? null,
      periods: [...rows].sort((a, b) => (a.start || "").localeCompare(b.start || "")),
    })).sort((a, b) => (a.periods[0].start || "").localeCompare(b.periods[0].start || ""));
  })();
  const rangesOverlap = (a?: typeof survey.destinations[number], b?: typeof survey.destinations[number]) => !!(a?.start && a?.end && b?.start && b?.end && a.start <= b.end && b.start <= a.end);
  const chosenArr = [...chosen];
  const overlapNote = hasTrips && chosenArr.some((k, i) => chosenArr.slice(i + 1).some((k2) => rangesOverlap(byKey.get(k), byKey.get(k2))));

  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n; };

  async function submit() {
    setErr("");
    if (hasTrips) { if (chosen.size === 0) { setErr("Pick at least one trip you'd join."); return; } }
    else if (survey.destinations.length > 0 && !topDest) { setErr("Pick your top choice of spot."); return; }
    // Preview: run the full flow (incl. the thank-you) without saving anything.
    if (preview) { setDone(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          top_destination: hasTrips ? null : topDest,
          other_destinations: hasTrips ? chosenArr : [...alsoDest].filter((k) => k !== topDest),
          weeks: hasTrips ? [] : [...weeks],
          budget_ok: budgetOk,
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
        <p className="text-[14px] text-[#5a6b72] mt-2 max-w-[420px] mx-auto">{preview ? "This is the confirmation members see. (Preview — nothing was saved.)" : "Your answers are in. This really helps me shape the trip — I’ll be in touch if it comes together. 🌊"}</p>
      </div>
    );
  }

  const card = "rounded-2xl border border-[#ecdcbb] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(120,90,20,0.05)]";
  const label = "text-[12px] font-black uppercase tracking-[0.16em] text-[#b0791e]";

  return (
    <div className="space-y-4">
      {/* Trip options — a card per PLACE (big), with a period pill per date window
          (small) underneath. Picking a period selects that trip; the place card
          lights up. One period → the whole card is the toggle. */}
      {hasTrips && (
        <div className={card}>
          <p className={label}>Which trips would you join?</p>
          <p className="text-[13px] text-[#8a97a0] mt-1 mb-3.5">Dates &amp; place are fixed — tick every window you&apos;d want in on. The more you pick, the more likely we run the ones you want.</p>
          <div className="space-y-2.5">
            {tripGroups.map((g) => {
              const anyOn = g.periods.some((p) => chosen.has(p.key));
              const single = g.periods.length === 1;
              const Head = (
                <div className="min-w-0">
                  <span className="block text-[17px] font-black text-[#00374a]">{g.name}</span>
                  {g.location && <span className="block text-[13px] font-bold text-[#b0791e]/90 mt-0.5">{g.location}</span>}
                  {single && (g.periods[0].start || g.periods[0].end) && <span className="block text-[15px] font-bold text-[#b0791e] mt-0.5">{fmtWeek(g.periods[0].start ?? null, g.periods[0].end ?? null)}</span>}
                  {g.blurb && <span className="block text-[13.5px] text-[#6a7a80] mt-1.5 leading-relaxed">{g.blurb}</span>}
                </div>
              );
              const cls = `rounded-2xl border-2 p-4 sm:p-5 transition-colors ${anyOn ? "border-[#f0a500] bg-[#fff7e6] shadow-[0_8px_22px_rgba(240,165,0,0.14)]" : "border-[#ecdcbb] bg-white hover:border-[#f2cf8a]"}`;
              const check = (on: boolean) => `shrink-0 mt-0.5 grid place-items-center w-6 h-6 rounded-full border-2 transition-colors ${on ? "border-[#f0a500] bg-[#f0a500] text-white" : "border-[#e2d8c6] text-transparent"}`;
              const tick = <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
              // single date window → the whole card toggles it
              if (single) {
                const on = chosen.has(g.periods[0].key);
                return (
                  <button key={g.key} type="button" onClick={() => setChosen((s) => toggle(s, g.periods[0].key))} className={`w-full text-left ${cls}`}>
                    <div className="flex items-start justify-between gap-3">{Head}<span className={check(on)}>{tick}</span></div>
                  </button>
                );
              }
              // multiple windows → a pill per period; picking one selects the place
              return (
                <div key={g.key} className={cls}>
                  <div className="flex items-start justify-between gap-3">{Head}<span className={check(anyOn)}>{tick}</span></div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {g.periods.map((p) => {
                      const on = chosen.has(p.key);
                      return (
                        <button key={p.key} type="button" onClick={() => setChosen((s) => toggle(s, p.key))}
                          className={`px-3.5 py-2 rounded-full text-[13px] font-bold transition-colors ${on ? "bg-[#f0a500] text-white" : "bg-[#fbf3e0] text-[#8a6a1e] border border-[#ecdcbb] hover:border-[#f2cf8a]"}`}>
                          {on ? "✓ " : ""}{fmtWeek(p.start ?? null, p.end ?? null) || "Dates flexible"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {overlapNote && <p className="text-[12px] text-[#a58a5e] mt-3">Some of your picks overlap in dates — no problem. Tell us all you&apos;d join and we&apos;ll help you land on one if both happen.</p>}
        </div>
      )}

      {/* Destinations (classic: pick a spot + choose weeks separately) */}
      {!hasTrips && survey.destinations.length > 0 && (
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

      {/* Weeks (classic mode only — trips carry their own dates) */}
      {!hasTrips && survey.weeks.length > 0 && (
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
                  {(w.start || w.end) && <span className="block text-[15px] font-bold text-[#b0791e] mt-1">{fmtWeek(w.start, w.end)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget — just the approximate figure + a comfort check */}
      {survey.budget_anchor != null && (
        <div className={card}>
          <p className={label}>The budget</p>
          <p className="text-[13.5px] text-[#5a6b72] mt-1.5 mb-3.5 leading-relaxed">
            This trip would be around <strong className="text-[#00374a] text-[17px]">{fmt(survey.budget_anchor)}</strong> per person. Is that comfortable for you?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([["yes", "Yes, works 👍"], ["maybe", "Maybe"], ["no", "Too much"]] as const).map(([val, txt]) => {
              const on = budgetOk === val;
              return (
                <button key={val} type="button" onClick={() => setBudgetOk(on ? null : val)}
                  className={`rounded-xl border-2 px-3 py-3 text-[14px] font-bold transition-colors ${on ? "border-[#f0a500] bg-[#fff7e6] text-[#00374a] shadow-[0_6px_18px_rgba(240,165,0,0.12)]" : "border-[#ecdcbb] bg-white text-[#3a4a50] hover:border-[#f2cf8a]"}`}>
                  {txt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Looking for */}
      <div className={card}>
        <p className={label}>What are you looking for in this trip?</p>
        <p className="text-[13px] text-[#8a97a0] mt-1 mb-3">Coaching, wind guarantee, a chill vibe, luxury, exploration… tell me what would make it perfect for you.</p>
        <textarea value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} rows={4}
          placeholder="In your words…"
          className="w-full rounded-xl border border-[#d8e3e6] px-3.5 py-3 text-[15px] outline-none focus:border-[#00afdb] transition-colors resize-y" />
      </div>

      {err && <p className="text-[13px] text-[#c0392b] font-semibold">{err}</p>}
      <button type="button" onClick={submit} disabled={busy}
        className="w-full rounded-full text-white text-[15.5px] font-black py-4 disabled:opacity-50 transition-transform hover:-translate-y-0.5 shadow-[0_12px_30px_rgba(240,123,32,0.26)]"
        style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
        {busy ? "Sending…" : existing ? "Update my answers" : "Send my answers"}
      </button>
      <p className="text-[12px] text-[#a58a5e] text-center">Private — only Nico &amp; the NP7 team see this.</p>
    </div>
  );
}
