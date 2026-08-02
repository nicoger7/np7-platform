"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type SetupStep = {
  key: string; label: string; hint?: string; done: boolean; href: string; accent?: boolean;
  /** Finishable right here instead of on another page. */
  inline?: "handle";
};

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
            s.inline === "handle" ? (
              <HandleStep key={s.key} step={s} />
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
          ))
        )}
      </div>
    </section>
  );
}


/**
 * Pick a handle without leaving home.
 *
 * 30 of 41 members never finished this step. It linked to /account/profile, so
 * completing it meant leaving the page you had just arrived on — and nobody
 * comes back for a username. Ask for it here, in one field.
 *
 * And it stops asking. Three "not now"s and it hides for good: a checklist item
 * that can't be dismissed stops being a checklist and starts being wallpaper.
 */
function HandleStep({ step }: { step: SetupStep }) {
  const KEY = "np7:handle-prompt-dismissed";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setHidden(Number(window.localStorage.getItem(KEY) ?? "0") >= 3); } catch { /* private mode */ }
    setReady(true);
  }, []);

  const dismiss = () => {
    try {
      const n = Number(window.localStorage.getItem(KEY) ?? "0") + 1;
      window.localStorage.setItem(KEY, String(n));
      if (n >= 3) setHidden(true);
    } catch { /* ignore */ }
    setOpen(false);
  };

  async function save() {
    const handle = value.trim().replace(/^@/, "");
    if (!handle) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/portal/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: handle }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "That one didn't work — try another."); return; }
      window.location.reload(); // the step (and the progress bar) recompute server-side
    } catch { setErr("Couldn't save just now."); }
    finally { setBusy(false); }
  }

  if (!ready || hidden) return null;

  if (!open) {
    return (
      <div className="flex items-center gap-3 px-1 py-1.5">
        <span className="shrink-0 w-5 h-5 rounded-full border-2 border-[#cdd6d9]" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-bold text-[#00374a]">{step.label}</span>
          {step.hint && <span className="block text-[11.5px] text-[#9aa6ac] leading-snug">{step.hint}</span>}
        </span>
        <button onClick={() => setOpen(true)} className="shrink-0 text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] rounded-full px-3 py-1 transition-colors">
          Pick one
        </button>
        <button onClick={dismiss} className="shrink-0 text-[12px] text-[#b6c2c7] hover:text-[#6a7a80] transition-colors" title="Hide this">
          Not now
        </button>
      </div>
    );
  }

  return (
    <div className="px-1 py-2">
      <p className="text-[13.5px] font-bold text-[#00374a] mb-1.5">{step.label}</p>
      <div className="flex items-center gap-2">
        <div className="flex items-center flex-1 min-w-0 rounded-xl border border-[#dde6e9] bg-white focus-within:border-[#00afdb] transition-colors">
          <span className="pl-3 text-[15px] text-[#9aa6ac]">@</span>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="yourname" maxLength={30}
            className="flex-1 min-w-0 px-1.5 py-2 text-[15px] text-[#0a2a33] outline-none bg-transparent" />
        </div>
        <button onClick={save} disabled={busy || !value.trim()}
          className="shrink-0 text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-40 rounded-full px-4 py-2 transition-colors">
          {busy ? "…" : "Save"}
        </button>
      </div>
      {err && <p className="text-[12px] font-semibold text-[#c0392b] mt-1.5">{err}</p>}
      <button onClick={dismiss} className="text-[12px] text-[#b6c2c7] hover:text-[#6a7a80] mt-1.5 transition-colors">Not now</button>
    </div>
  );
}
