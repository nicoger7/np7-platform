"use client";

import { useEffect, useRef, useState } from "react";
import type { Survey, SurveyResponse } from "@/lib/surveys";

/**
 * The one-tap interest survey. The invite email's buttons already registered an
 * answer (the link carries it); this page confirms it and lets the rider adjust —
 * every tap saves instantly, there is no submit button. Deliberately tiny:
 * "would you join, and which dates?" — nothing else.
 */

const DECLINE_NOTE = "Can't make it this time";

function fmtRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "dates TBC";
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", o);
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (start && end) {
    if (start.slice(0, 7) === end.slice(0, 7)) return `${+start.slice(8, 10)} – ${f(end, full)}`;
    if (start.slice(0, 4) === end.slice(0, 4)) return `${f(start, { day: "numeric", month: "short" })} – ${f(end, full)}`;
    return `${f(start, full)} – ${f(end, full)}`;
  }
  return f((start ?? end)!, full);
}

export function SurveyQuick({ survey, token, existing, preview = false, justSaved = false }: {
  survey: Survey; token: string; existing?: SurveyResponse | null; preview?: boolean; justSaved?: boolean;
}) {
  const dated = survey.destinations.filter((d) => d.start || d.end);
  const [picks, setPicks] = useState<Set<string>>(new Set(existing?.other_destinations ?? []));
  const [declined, setDeclined] = useState(!!existing && (existing.other_destinations ?? []).length === 0 && !!existing.looking_for?.startsWith(DECLINE_NOTE));
  const [msg, setMsg] = useState(() => {
    const lf = existing?.looking_for ?? "";
    return lf.startsWith(DECLINE_NOTE) ? lf.slice(DECLINE_NOTE.length).replace(/^\s*—\s*/, "") : lf;
  });
  const [flash, setFlash] = useState<null | "saved" | "error">(justSaved ? "saved" : null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answered = declined || picks.size > 0;

  const showSaved = (kind: "saved" | "error" = "saved") => {
    setFlash(kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  };
  useEffect(() => { if (justSaved) { if (flashTimer.current) clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 3200); } return () => { if (flashTimer.current) clearTimeout(flashTimer.current); }; }, [justSaved]);

  async function persist(nextPicks: Set<string>, nextDeclined: boolean, nextMsg: string) {
    if (preview) { showSaved(); return; }
    const looking_for = nextDeclined
      ? (nextMsg.trim() ? `${DECLINE_NOTE} — ${nextMsg.trim()}` : DECLINE_NOTE)
      : (nextMsg.trim() || null);
    const res = await fetch(`/api/survey/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_destination: null, other_destinations: nextDeclined ? [] : [...nextPicks], weeks: [], budget_ok: null, looking_for }),
    }).catch(() => null);
    showSaved(res?.ok ? "saved" : "error");
  }

  function toggle(key: string) {
    const next = new Set(picks);
    if (next.has(key)) next.delete(key); else next.add(key);
    setPicks(next); setDeclined(false);
    persist(next, false, msg);
  }
  function decline() {
    setPicks(new Set()); setDeclined(true);
    persist(new Set(), true, msg);
  }

  // message autosave (debounced) — only once they've answered
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onMsg(v: string) {
    setMsg(v);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => { if (answered) persist(picks, declined, v); }, 900);
  }

  return (
    <div className="relative">
      {/* floating save state — the whole page is autosave, this is the receipt */}
      <div className={`pointer-events-none fixed top-4 inset-x-0 z-40 flex justify-center transition-all duration-300 ${flash ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}>
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-black text-white shadow-lg ${flash === "error" ? "bg-[#c0392b]" : "bg-[#1f9e57]"}`}>
          {flash === "error" ? "Hmm — that didn't save. Try again?" : "Saved ✓ — nothing else to do"}
        </span>
      </div>

      {/* state headline — warm, personal, zero-pressure */}
      <div className="text-center mb-7">
        {declined ? (
          <>
            <h2 className="text-[24px] sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">All good — thanks for telling us 🤙</h2>
            <p className="text-[14.5px] text-[#6a7a80] mt-2">Changed your mind? Just tap a date below — it saves instantly.</p>
          </>
        ) : picks.size > 0 ? (
          <>
            <h2 className="text-[24px] sm:text-[30px] font-black tracking-[-0.02em] text-[#1f9e57]">You&apos;re on the list 🌊</h2>
            <p className="text-[14.5px] text-[#6a7a80] mt-2">No commitment — this just tells us who&apos;s keen. Tap to adjust anytime.</p>
          </>
        ) : (
          <>
            <h2 className="text-[24px] sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">Would you join? One tap.</h2>
            <p className="text-[14.5px] text-[#6a7a80] mt-2">No commitment, no forms — just tell us if you&apos;d be in.</p>
          </>
        )}
      </div>

      {/* the date cards — THE question */}
      <div className="space-y-3">
        {dated.map((d) => {
          const on = picks.has(d.key);
          return (
            <button key={d.key} type="button" onClick={() => toggle(d.key)}
              className={`group w-full text-left rounded-2xl border-2 px-5 py-4 sm:px-6 sm:py-5 transition-all ${on ? "border-[#1f9e57] bg-[#f2fbf5] shadow-[0_10px_30px_rgba(31,158,87,0.14)]" : "border-[#ecdcbb] bg-white hover:border-[#f0a500] hover:shadow-[0_10px_28px_rgba(120,90,20,0.10)]"}`}>
              <span className="flex items-center gap-4">
                <span className={`shrink-0 grid place-items-center w-9 h-9 rounded-full border-2 transition-colors ${on ? "border-[#1f9e57] bg-[#1f9e57] text-white" : "border-[#d8cdbb] text-transparent group-hover:border-[#f0a500]"}`}>
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] sm:text-[19px] font-black tracking-[-0.01em] text-[#00374a]">{fmtRange(d.start, d.end)}</span>
                  <span className="block text-[13px] text-[#8a7a58] mt-0.5">{[d.label, d.location].filter(Boolean).join(" · ") || survey.title}</span>
                </span>
                <span className={`shrink-0 hidden sm:inline text-[12.5px] font-black uppercase tracking-wide ${on ? "text-[#1f9e57]" : "text-[#c9bda5] group-hover:text-[#f0a500]"}`}>{on ? "I'm in 🤙" : "Count me in"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* the honest out */}
      <div className="flex items-center gap-3 my-6">
        <span className="flex-1 h-px bg-[#ecdcbb]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c9bda5]">or</span>
        <span className="flex-1 h-px bg-[#ecdcbb]" />
      </div>
      <button type="button" onClick={decline}
        className={`w-full rounded-2xl border-2 border-dashed px-5 py-3.5 text-[14px] font-bold transition-colors ${declined ? "border-[#8a9aa0] bg-white text-[#3a4a50]" : "border-[#e2d8c6] text-[#8a9aa0] hover:border-[#8a9aa0] hover:text-[#3a4a50]"}`}>
        {declined ? "✓ Can't make it this time" : "Can't make it this time"}
      </button>

      {/* optional one-liner — appears once they've answered, so the first tap stays the only ask */}
      {answered && (
        <div className="mt-6">
          <label className="block text-[12px] font-black uppercase tracking-[0.1em] text-[#b0791e] mb-1.5">
            Anything we should know? <span className="normal-case tracking-normal font-medium text-[#c3b9a6]">— optional, saves as you type</span>
          </label>
          <input value={msg} onChange={(e) => onMsg(e.target.value.slice(0, 300))}
            placeholder={declined ? "e.g. keep me posted for other dates 🤙" : "e.g. only if my buddy Jens comes too 😄"}
            className="w-full rounded-xl border border-[#e2d8c6] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#f0a500] transition-colors" />
        </div>
      )}

      <p className="text-[12px] text-[#b9ac91] text-center mt-7">Every tap saves by itself — you can close this page whenever. 🌊</p>
    </div>
  );
}
