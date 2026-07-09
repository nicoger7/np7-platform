"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type SetupStep = { key: string; label: string; hint?: string; done: boolean; href: string; accent?: boolean };

/**
 * "Get set up" — an endowed-progress onboarding strip for the member home.
 *
 * Behavioral design, used honestly (per the UX-psychology principle set):
 * - Endowed progress / goal-gradient: the very first step (account created) is
 *   ALWAYS complete, so the bar never starts at a demotivating 0% — the rider
 *   sees they're already on their way and is pulled to finish.
 * - Every step is a REAL, useful action tied to actual account state (no fake
 *   progress). The strip removes itself entirely once nothing's left to do, so
 *   a set-up member is never nagged.
 * - Completion gets a beat of closure: the first time a member finishes the
 *   last step (they were seen incomplete on this device), the strip is replaced
 *   once by a warm "You're all set" moment instead of silently vanishing. A
 *   member who arrives already complete never sees it — no hollow celebration.
 */
export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const remaining = total - done;
  const pct = total ? Math.round((done / total) * 100) : 100;

  // Deterministic first paint (SSR-safe): strip when there's work, else nothing.
  // The localStorage-driven "you're all set" moment is decided after mount.
  const [phase, setPhase] = useState<"strip" | "celebrate" | "hidden">(remaining > 0 && total > 0 ? "strip" : "hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (remaining > 0) {
      // Remember, on this device, that they still had steps left — so when they
      // finish we know it's a genuine transition worth celebrating.
      window.localStorage.setItem("np7_setup_incomplete", "1");
      return;
    }
    const wasIncomplete = window.localStorage.getItem("np7_setup_incomplete") === "1";
    const celebrated = window.localStorage.getItem("np7_setup_celebrated") === "1";
    if (wasIncomplete && !celebrated) {
      window.localStorage.setItem("np7_setup_celebrated", "1");
      window.localStorage.removeItem("np7_setup_incomplete");
      setPhase("celebrate");
    }
  }, [remaining]);

  if (phase === "hidden") return null;

  if (phase === "celebrate") {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-[#cdeede] bg-gradient-to-br from-[#e9fbf2] to-[#fffdf5] p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setPhase("hidden")}
          aria-label="Dismiss"
          className="absolute top-3 right-3 w-7 h-7 grid place-items-center rounded-full text-[#9aa6ac] hover:text-[#00374a] hover:bg-white/70 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="shrink-0 grid place-items-center w-11 h-11 rounded-full bg-white text-[22px] shadow-[0_4px_14px_rgba(15,110,86,0.15)]" aria-hidden>🤙</span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#0f6e56]">All set</p>
            <h2 className="text-[17px] font-black tracking-[-0.01em] text-[#00374a] mt-0.5">You&apos;re all set — your NP7 home is ready</h2>
          </div>
        </div>
        <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-3">
          Profile complete. Everything you need for your trips lives here now — payments, prep, your crew and your photos.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac]">Get set up</p>
          <h2 className="text-[17px] font-black tracking-[-0.01em] text-[#00374a] mt-0.5">
            You&apos;re {pct}% there — {remaining} {remaining === 1 ? "step" : "steps"} to go
          </h2>
        </div>
        <span className="shrink-0 text-[13px] font-bold text-[#00afdb]">{done}/{total}</span>
      </div>

      {/* the bar starts filled (account is done), never at 0% */}
      <div className="h-2 rounded-full bg-[#eef3f4] overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ffc42e,#f47b20 55%,#00afdb)" }}
        />
      </div>

      <div className="space-y-1">
        {steps.map((s) =>
          s.done ? (
            <div key={s.key} className="flex items-center gap-3 px-1 py-1.5 text-[13.5px]">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#e1f5ee] text-[#0f6e56] grid place-items-center text-[11px] font-bold">✓</span>
              <span className="text-[#9aa6ac] line-through decoration-[#d3dbde]">{s.label}</span>
            </div>
          ) : (
            <Link key={s.key} href={s.href} className="group flex items-center gap-3 px-1 py-1.5 rounded-lg hover:bg-[#f7fbfc] transition-colors">
              <span className={`shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${s.accent ? "border-[#f47b20]" : "border-[#cdd6d9]"} group-hover:border-[#00afdb]`} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold text-[#00374a]">{s.label}</span>
                {s.hint && <span className="block text-[11.5px] text-[#9aa6ac] leading-snug">{s.hint}</span>}
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-bold text-[#00afdb] opacity-0 group-hover:opacity-100 transition-opacity">
                {s.accent ? "Secure" : "Do it"}
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          )
        )}
      </div>
    </section>
  );
}
