"use client";

import { useState, useEffect, useRef } from "react";
import type { Survey, SurveyResponse, SurveyDestination } from "@/lib/surveys";
import { satImage } from "@/lib/satellite";

/**
 * The member-facing trip-interest form (reached only via a secret token link).
 * Built to feel like a premium, personal invitation — not a form: image-forward
 * trip cards (spot photo → satellite view of the area → branded fallback) that
 * zoom as you scroll, a live progress rail (endowed progress + goal-gradient), and
 * a running "you're in for N" counter that rewards every pick. Ethical nudges
 * only — nothing fake. Submits to /api/survey/[token].
 */

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A trip's image: an uploaded photo → a satellite view of its pin → null (gradient).
function tripImage(rows: SurveyDestination[]): string | null {
  const withImg = rows.find((r) => r.image)?.image;
  if (withImg) return withImg;
  const withCoord = rows.find((r) => r.lat != null && r.lng != null);
  return withCoord ? satImage(withCoord.lat as number, withCoord.lng as number, { dLat: 0.05, w: 1200, h: 760 }) : null;
}

export function SurveyForm({ survey, token, contactName, existing, preview = false }: {
  survey: Survey; token: string; contactName: string | null; existing: SurveyResponse | null; preview?: boolean;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: survey.currency || "EUR", maximumFractionDigits: 0 }).format(n);
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
  const rootRef = useRef<HTMLDivElement>(null);

  const hasTrips = survey.destinations.some((d) => !!(d.start || d.end));
  const byKey = new Map(survey.destinations.map((d) => [d.key, d]));
  const tripGroups = (() => {
    const m = new Map<string, SurveyDestination[]>();
    for (const d of survey.destinations) {
      const gk = d.groupId ?? (d.label || d.location || d.key).trim();
      if (!m.has(gk)) m.set(gk, []);
      m.get(gk)!.push(d);
    }
    return [...m.entries()].map(([, rows]) => ({
      key: rows[0].key, name: (rows.find((r) => r.label)?.label || rows[0].location || rows[0].key).trim(),
      location: rows.find((r) => r.location)?.location ?? null,
      blurb: rows.find((r) => r.blurb)?.blurb ?? null,
      image: tripImage(rows),
      focus: rows.find((r) => r.image)?.focus ?? null,
      periods: [...rows].sort((a, b) => (a.start || "").localeCompare(b.start || "")),
    })).sort((a, b) => (a.periods[0].start || "").localeCompare(b.periods[0].start || ""));
  })();
  // Adaptive density: a few trips → big immersive cards; many → a tighter 2-up grid
  // so 4–5 places don't become an endless scroll. Dates always stay as chips.
  const many = tripGroups.length > 3;
  const rangesOverlap = (a?: SurveyDestination, b?: SurveyDestination) => !!(a?.start && a?.end && b?.start && b?.end && a.start <= b.end && b.start <= a.end);
  const chosenArr = [...chosen];
  const overlapNote = hasTrips && chosenArr.some((k, i) => chosenArr.slice(i + 1).some((k2) => rangesOverlap(byKey.get(k), byKey.get(k2))));
  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n; };

  // ── Progress (endowed + goal-gradient) ────────────────────────────────────
  const pickedTrips = hasTrips ? chosen.size : (topDest ? 1 : 0);
  const applicable: boolean[] = [];
  if (hasTrips || survey.destinations.length > 0) applicable.push(pickedTrips > 0);
  if (survey.budget_anchor != null) applicable.push(budgetOk != null);
  if (survey.ask_wishes !== false) applicable.push(lookingFor.trim().length > 0);
  const doneCount = applicable.filter(Boolean).length;
  const complete = doneCount === applicable.length;
  // start already part-filled — being invited is progress, not zero (endowed progress)
  const pct = Math.round((0.18 + 0.82 * (applicable.length ? doneCount / applicable.length : 0)) * 100);
  const progressLabel = complete ? "Ready to send 🤙" : doneCount === 0 ? "You're invited — take a look 👇" : "Almost there…";

  // ── Scroll-zoom (Ken Burns) on the trip images + gentle reveal ─────────────
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;
    root.classList.add("sv-armed"); // JS is running → enable the hide-then-reveal
    const zooms = Array.from(root.querySelectorAll<HTMLElement>("[data-zoom]"));
    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      for (const z of zooms) {
        const frame = z.parentElement as HTMLElement;
        const r = frame.getBoundingClientRect();
        const p = clamp((vh - r.top) / (vh + r.height)); // 0 entering bottom → 1 leaving top
        z.style.transform = `scale(${(1.08 + 0.16 * p).toFixed(3)}) translateY(${(-8 * (p - 0.5)).toFixed(1)}px)`;
      }
      raf = 0;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // reveal-on-enter
    // Reveal via a DATA attribute, not classList: React re-renders (e.g. picking
    // a date recomputes the card's className) rewrite the class attribute and
    // would wipe an observer-added class — the card would vanish mid-interaction.
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && ((e.target as HTMLElement).dataset.in = "1")), { threshold: 0.12 });
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); io.disconnect(); };
  }, [tripGroups.length]);

  async function submit() {
    setErr("");
    if (hasTrips) { if (chosen.size === 0) { setErr("Pick at least one trip you'd join."); return; } }
    else if (survey.destinations.length > 0 && !topDest) { setErr("Pick your top choice of spot."); return; }
    if (preview) { setDone(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // trips mode: the starred date is the top pick; a single pick is
          // implicitly the favourite
          top_destination: hasTrips
            ? (topDest && chosen.has(topDest) ? topDest : chosen.size === 1 ? [...chosen][0] : null)
            : topDest,
          other_destinations: hasTrips ? chosenArr : [...alsoDest].filter((k) => k !== topDest),
          weeks: hasTrips ? [] : [...weeks],
          budget_ok: budgetOk, looking_for: lookingFor.trim() || null,
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
      <div className="rounded-3xl border border-[#bfe6d7] bg-[#f1faf5] p-9 text-center shadow-[0_16px_40px_rgba(20,120,80,0.08)]">
        <div className="text-5xl mb-3">🤙</div>
        <h2 className="text-[24px] font-black text-[#00374a]">Thank you{contactName ? `, ${contactName.split(/\s+/)[0]}` : ""}!</h2>
        <p className="text-[14.5px] text-[#5a6b72] mt-2.5 max-w-[440px] mx-auto leading-relaxed">{preview ? "This is the confirmation members see. (Preview — nothing was saved.)" : "Your answers are in. This genuinely shapes which trips we run — I'll be in touch if it comes together. 🌊"}</p>
        {pickedTrips > 0 && !preview && <p className="text-[13px] text-[#1f7a4d] font-bold mt-3">You're in for {pickedTrips} trip{pickedTrips === 1 ? "" : "s"}.</p>}
      </div>
    );
  }

  const card = "rounded-3xl border border-[#ecdcbb] bg-white p-6 sm:p-7 shadow-[0_10px_30px_rgba(120,90,20,0.05)]";
  const label = "text-[12px] font-black uppercase tracking-[0.18em] text-[#b0791e]";

  return (
    <div ref={rootRef} className="relative">
      <style>{`
        /* Content is visible by DEFAULT — only hidden once JS arms the reveal, so a
           slow/failed hydration never leaves the form blank. */
        [data-reveal]{transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
        .sv-armed [data-reveal]{opacity:0;transform:translateY(22px)}
        .sv-armed [data-reveal][data-in="1"]{opacity:1;transform:none}
        @media (prefers-reduced-motion: reduce){.sv-armed [data-reveal]{opacity:1;transform:none;transition:none}}
        @keyframes sv-pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        .sv-pop{animation:sv-pop .34s cubic-bezier(.2,.8,.3,1.2)}
      `}</style>

      {/* Sticky progress rail — a filling gold bar + a live "you're in for N" chip.
          Being invited already counts (endowed progress); it eases toward Ready. */}
      <div className="sticky top-0 z-30 -mx-5 sm:-mx-8 px-5 sm:px-8 py-2.5 mb-6 backdrop-blur-md bg-[#fdf6ea]/85 border-b border-[#efe2c8]">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-[#efe2c8] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ffd97a,#f0a500 55%,#f47b20)" }} />
          </div>
          <span className="shrink-0 text-[12px] font-bold text-[#8a6a1e] tabular-nums w-[132px] text-right">{progressLabel}</span>
        </div>
        {pickedTrips > 0 && (
          <p className="text-[12px] font-black text-[#1f9e57] mt-1.5">🤙 You&apos;re in for {pickedTrips} trip{pickedTrips === 1 ? "" : "s"}{hasTrips ? " — pick more, run more" : ""}.</p>
        )}
      </div>

      <div className="space-y-5">
        {/* ── TRIPS: image-forward cards that zoom as you scroll ── */}
        {hasTrips && (
          <section data-reveal>
            <p className={label}>Which trips would you join?</p>
            <p className="text-[13.5px] text-[#8a97a0] mt-1 mb-4">Tick every date that would work for you — the more you pick, the more likely we run the one you want.{chosen.size >= 2 ? <> <span className="font-semibold text-[#b0791e]">Star ⭐ your favourite.</span></> : null}</p>
            <div className={many ? "grid sm:grid-cols-2 gap-3.5" : "space-y-4"}>
              {tripGroups.map((g, gi) => {
                const anyOn = g.periods.some((p) => chosen.has(p.key));
                const single = g.periods.length === 1;
                const Banner = (
                  <div className={`relative overflow-hidden bg-[#0a2a33] ${many ? "h-40" : "h-52 sm:h-60"}`}>
                    {g.image
                      ? <div data-zoom className="absolute inset-0 bg-cover will-change-transform" style={{ backgroundImage: `url('${g.image}')`, backgroundPosition: `50% ${g.focus ?? 50}%` }} />
                      : <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#0f6f86,#00afdb 55%,#1aa3c7)" }} />}
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,30,40,0.15) 0%, rgba(0,28,38,0.15) 45%, rgba(0,26,36,0.92) 100%)" }} />
                    {single && (g.periods[0].start || g.periods[0].end) && (
                      <span className="absolute top-3.5 left-4 inline-flex items-center rounded-full bg-black/45 backdrop-blur-sm text-white text-[12px] font-bold px-3 py-1.5">{fmtWeek(g.periods[0].start ?? null, g.periods[0].end ?? null)}</span>
                    )}
                    <span className={`absolute top-3.5 right-4 grid place-items-center w-8 h-8 rounded-full border-2 transition-all ${anyOn ? "border-[#ffc42e] bg-[#ffc42e] text-[#00374a] scale-105" : "border-white/70 bg-black/25 text-transparent"}`}>
                      <svg key={anyOn ? "on" : "off"} className={anyOn ? "w-4 h-4 sv-pop" : "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                    <div className="absolute left-5 right-5 bottom-4">
                      <h3 className="text-white text-[24px] sm:text-[27px] font-black tracking-[-0.02em] leading-tight drop-shadow-[0_2px_10px_rgba(0,20,30,0.6)]">{g.name}</h3>
                      {g.location && <p className="text-[#ffe0a0] text-[13.5px] font-bold mt-0.5">{g.location}</p>}
                    </div>
                  </div>
                );
                const shell = `group relative block w-full text-left overflow-hidden rounded-3xl border-2 transition-all duration-200 ${anyOn ? "border-[#f0a500] shadow-[0_16px_44px_rgba(240,165,0,0.24)] -translate-y-0.5" : "border-transparent shadow-[0_10px_30px_rgba(0,30,40,0.10)] hover:-translate-y-0.5"}`;
                const singleKey = g.periods[0].key;
                const singleTop = topDest === singleKey;
                const Body = (
                  <div className="bg-white p-5">
                    {/* single-date card: the star lives here (the card itself is a button,
                        so this is a span — stopPropagation keeps the card from toggling) */}
                    {single && anyOn && chosen.size >= 2 && (
                      <span role="button" tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTopDest(singleTop ? null : singleKey); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setTopDest(singleTop ? null : singleKey); } }}
                        title={singleTop ? "Your favourite — tap to unstar" : "Make this my favourite"}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold mb-2 transition-all ${singleTop ? "bg-[#ffc42e] text-[#00374a] shadow-[0_4px_12px_rgba(240,165,0,0.4)]" : "border border-[#ecdcbb] text-[#8a6a1e] opacity-70 hover:opacity-100"}`}>
                        {singleTop ? "⭐ My favourite" : "☆ Make this my favourite"}
                      </span>
                    )}
                    {g.blurb && <p className="text-[14px] text-[#5a6b72] leading-relaxed">{g.blurb}</p>}
                    {!single && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {g.periods.map((p) => {
                          const on = chosen.has(p.key);
                          const isTop = topDest === p.key;
                          return (
                            <span key={p.key} className="inline-flex items-center gap-1">
                              <button type="button" onClick={() => { setChosen((s) => toggle(s, p.key)); if (isTop && on) setTopDest(null); }}
                                className={`px-3.5 py-2 rounded-full text-[13px] font-bold transition-colors ${on ? "bg-[#f0a500] text-white" : "bg-[#fbf3e0] text-[#8a6a1e] border border-[#ecdcbb] hover:border-[#f2cf8a]"}`}>
                                {on ? "✓ " : ""}{fmtWeek(p.start ?? null, p.end ?? null) || "Dates flexible"}
                              </button>
                              {/* the TOP-PICK star: only on selected dates, once there's a real choice */}
                              {on && chosen.size >= 2 && (
                                <button type="button" onClick={() => setTopDest(isTop ? null : p.key)}
                                  title={isTop ? "Your favourite — tap to unstar" : "Make this my favourite"}
                                  aria-label={isTop ? "Unstar this date" : "Star this date as favourite"}
                                  className={`grid place-items-center w-8 h-8 rounded-full text-[15px] transition-all ${isTop ? "bg-[#ffc42e] shadow-[0_4px_12px_rgba(240,165,0,0.4)] scale-105" : "border border-[#ecdcbb] opacity-60 hover:opacity-100"}`}>
                                  {isTop ? "⭐" : "☆"}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
                return single ? (
                  <div key={g.key} data-reveal style={{ transitionDelay: `${gi * 60}ms` }}>
                    <button type="button" onClick={() => { setChosen((s) => toggle(s, g.periods[0].key)); if (singleTop && anyOn) setTopDest(null); }} className={shell}>{Banner}{Body}</button>
                  </div>
                ) : (
                  <div key={g.key} data-reveal style={{ transitionDelay: `${gi * 60}ms` }} className={shell}>{Banner}{Body}</div>
                );
              })}
            </div>
            {overlapNote && <p className="text-[12px] text-[#a58a5e] mt-3">Some of your picks overlap in dates — no problem. Tell us all you&apos;d join and we&apos;ll help you land on one if both happen.</p>}
          </section>
        )}

        {/* ── Classic mode (no fixed dates): pick a top spot + weeks ── */}
        {!hasTrips && survey.destinations.length > 0 && (
          <section data-reveal className={card}>
            <p className={label}>Where would you want to go?</p>
            <p className="text-[13px] text-[#8a97a0] mt-1 mb-3">Pick your top choice.</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {survey.destinations.map((d) => {
                const on = topDest === d.key;
                return (
                  <button key={d.key} type="button" onClick={() => setTopDest(d.key)}
                    className={`text-left rounded-xl border-2 px-4 py-3.5 font-bold text-[15px] transition-colors ${on ? "border-[#f0a500] bg-[#fff7e6] text-[#00374a] shadow-[0_6px_18px_rgba(240,165,0,0.14)]" : "border-[#ecdcbb] bg-white text-[#3a4a50] hover:border-[#f2cf8a]"}`}>
                    <span className="flex items-center justify-between gap-2">{d.label}{on && <span className="text-[11px] font-black" style={{ color: "#b0791e" }}>★ TOP PICK</span>}</span>
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
                        className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${on ? "border-[#e0992a] bg-[#fff2d8] text-[#8a5e12]" : "border-[#e7ddcb] bg-white text-[#3a4a50] hover:border-[#e0992a]"}`}>{d.label}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
        {!hasTrips && survey.weeks.length > 0 && (
          <section data-reveal className={card}>
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
          </section>
        )}

        {/* ── Budget ── */}
        {survey.budget_anchor != null && (
          <section data-reveal className={card}>
            <p className={label}>The budget</p>
            <p className="text-[13.5px] text-[#5a6b72] mt-1.5 mb-3.5 leading-relaxed">This trip would be around <strong className="text-[#00374a] text-[17px]">{fmt(survey.budget_anchor)}</strong> per person. Is that comfortable for you?</p>
            <div className="grid grid-cols-3 gap-2">
              {([["yes", "Yes, works 👍"], ["maybe", "Maybe"], ["no", "Too much"]] as const).map(([val, txt]) => {
                const on = budgetOk === val;
                return (
                  <button key={val} type="button" onClick={() => setBudgetOk(on ? null : val)}
                    className={`rounded-xl border-2 px-3 py-3 text-[14px] font-bold transition-colors ${on ? "border-[#f0a500] bg-[#fff7e6] text-[#00374a] shadow-[0_6px_18px_rgba(240,165,0,0.12)]" : "border-[#ecdcbb] bg-white text-[#3a4a50] hover:border-[#f2cf8a]"}`}>{txt}</button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Looking for — optional per survey (premium trips) ── */}
        {survey.ask_wishes !== false && (
          <section data-reveal className={card}>
            <p className={label}>What are you looking for in this trip?</p>
            <p className="text-[13px] text-[#8a97a0] mt-1 mb-3">Coaching, wind guarantee, a chill vibe, luxury, exploration… tell me what would make it perfect for you.</p>
            <textarea value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} rows={4} placeholder="In your words…"
              className="w-full rounded-xl border border-[#d8e3e6] px-3.5 py-3 text-[15px] outline-none focus:border-[#00afdb] transition-colors resize-y" />
          </section>
        )}

        {err && <p className="text-[13px] text-[#c0392b] font-semibold">{err}</p>}
        <button type="button" onClick={submit} disabled={busy}
          className="w-full rounded-full text-white text-[15.5px] font-black py-4 disabled:opacity-50 transition-transform hover:-translate-y-0.5 shadow-[0_12px_30px_rgba(240,123,32,0.26)]"
          style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
          {busy ? "Sending…" : existing ? "Update my answers" : pickedTrips > 0 ? `Send my answers — ${pickedTrips} trip${pickedTrips === 1 ? "" : "s"}` : "Send my answers"}
        </button>
        <p className="text-[12px] text-[#a58a5e] text-center">Private — only Nico &amp; the NP7 team see this.</p>
      </div>
    </div>
  );
}
