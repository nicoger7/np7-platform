"use client";

import { useState } from "react";

export type TicketDate = { id: string; label: string; sub?: string };

/**
 * The event ticket box. Two shapes:
 *   fixed   → one date, pay 100% now.
 *   standby → pick the dates you can make, pay a non-refundable deposit now.
 * Posts to /api/event/checkout and redirects to Stripe (or shows a friendly
 * "we'll follow up" when Stripe isn't configured yet).
 */
export function EventTicket({
  experienceId, mode, priceLabel, depositLabel, balanceLabel, refundLabel, dates, fixedDate, isMember,
}: {
  experienceId: string;
  mode: "fixed" | "standby";
  priceLabel: string;
  depositLabel: string;
  balanceLabel: string;
  refundLabel: string;
  dates: TicketDate[];        // standby candidate dates
  fixedDate: TicketDate | null;
  isMember: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/event/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId,
          dateIds: mode === "standby" ? picked : fixedDate ? [fixedDate.id] : [],
          firstName, lastName, email, phone,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Something went wrong — please try again."); setBusy(false); return; }
      if (j.url) { window.location.assign(j.url); return; }   // → Stripe
      setDone(true); setBusy(false);                          // saved, no online payment configured
    } catch {
      setError("Something went wrong — please try again."); setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-[#00374a] text-white p-7 text-center">
        <p className="text-[15px] font-bold">You&apos;re on the list! 🤙</p>
        <p className="text-[13.5px] text-white/70 mt-2">We&apos;ll be in touch by email to sort your payment and confirm the details.</p>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-[#dfe6e9] bg-white text-[#0a2a33] placeholder:text-[#9aa6ac] px-4 py-3 text-[15px] outline-none focus:border-[#00afdb] transition-colors";
  const canSubmit = (mode === "fixed" || picked.length > 0) && (isMember || (firstName.trim() && lastName.trim() && /\S+@\S+\.\S+/.test(email)));

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-[#e3e9ec] shadow-[0_18px_50px_rgba(0,40,55,0.1)] p-6 sm:p-7">
      {/* price line */}
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac]">{mode === "standby" ? "Deposit today" : "Ticket"}</span>
        <span className="text-[28px] font-black text-[#00374a] tabular-nums">{mode === "standby" ? depositLabel : priceLabel}</span>
      </div>
      {mode === "standby" && (
        <p className="text-[12.5px] text-[#6a7a80] mt-1">of {priceLabel} total · balance {balanceLabel} once your date is set</p>
      )}

      {/* fixed date line */}
      {mode === "fixed" && fixedDate && (
        <div className="mt-4 rounded-xl bg-[#f4fbfc] border border-[#d7ecf1] px-4 py-3">
          <p className="text-[15px] font-bold text-[#00374a]">{fixedDate.label}</p>
          {fixedDate.sub && <p className="text-[12.5px] text-[#6a7a80]">{fixedDate.sub}</p>}
        </div>
      )}

      {/* standby date picker */}
      {mode === "standby" && (
        <div className="mt-4">
          <p className="text-[13.5px] font-bold text-[#00374a] mb-2">Which dates could you make it?</p>
          <div className="space-y-2">
            {dates.map((d) => {
              const on = picked.includes(d.id);
              return (
                <button key={d.id} type="button" onClick={() => toggle(d.id)}
                  className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all ${on ? "border-[#00afdb] bg-[#00afdb]/[0.06]" : "border-[#e3e9ec] hover:border-[#bcd]"}`}>
                  <span className={`grid place-items-center w-5 h-5 rounded-md border-2 shrink-0 ${on ? "bg-[#00afdb] border-[#00afdb]" : "border-[#c3ccd0]"}`}>
                    {on && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold text-[#00374a]">{d.label}</span>
                    {d.sub && <span className="block text-[12px] text-[#6a7a80]">{d.sub}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-[#8a9aa0] mt-2.5 leading-relaxed">
            Pick every date that works for you — we confirm one, usually a few days before. Your deposit is non-refundable if any of your dates runs. If none of them run, you get {refundLabel} back.
          </p>
        </div>
      )}

      {/* buyer details (guests only) */}
      {!isMember && (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <input className={input} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <input className={input} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          <input className={`${input} sm:col-span-2`} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input className={`${input} sm:col-span-2`} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
      )}

      {error && <p className="text-[13px] font-semibold text-[#c0392b] mt-3">{error}</p>}

      <button type="submit" disabled={!canSubmit || busy}
        className="mt-5 w-full rounded-full py-3.5 text-[15px] font-black text-[#00374a] disabled:opacity-45 transition-transform active:scale-[0.99]"
        style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 60%,#f47b20)" }}>
        {busy ? "One sec…" : mode === "standby" ? `Secure my spot — ${depositLabel}` : `Book my ticket — ${priceLabel}`}
      </button>
      <p className="text-[11.5px] text-[#9aa6ac] text-center mt-2.5">Secure payment via Stripe.</p>
    </form>
  );
}
