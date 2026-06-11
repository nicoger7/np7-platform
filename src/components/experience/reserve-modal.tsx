"use client";

import { useState } from "react";

export const DEPOSIT_EUR = 300;

export type ReserveContext = {
  experienceId: string;
  experienceTitle: string;
  editionId: string | null;
  editionLabel: string | null;
  editionDates: string | null;
  packageId: string;
  level: string;
  accommodation: string;
  price: number;
  currency?: string;
};

/**
 * The booking form: First name · Last name · Email · Phone → pay the €300
 * deposit via Stripe Checkout. Deliberately nothing else — every extra field
 * costs conversions. The details get sorted personally after payment.
 */
export function ReserveModal({ ctx, onClose }: { ctx: ReserveContext; onClose: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [savedNoPayment, setSavedNoPayment] = useState(false);

  const symbol = ctx.currency === "EUR" || !ctx.currency ? "€" : `${ctx.currency} `;
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-US")}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: ctx.experienceId,
          editionId: ctx.editionId,
          packageId: ctx.packageId,
          firstName,
          lastName,
          email,
          phone,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong — please try again.");
        setSubmitting(false);
        return;
      }
      if (json.url) {
        window.location.href = json.url; // → Stripe Checkout
        return;
      }
      setSavedNoPayment(true); // fallback: reservation saved, payment link follows
      setSubmitting(false);
    } catch {
      setError("Something went wrong — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Reserve your spot">
      <button className="absolute inset-0 bg-[#00141d]/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-[460px] bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_30px_80px_rgba(0,20,30,0.4)] max-h-[92svh] overflow-y-auto">
        {savedNoPayment ? (
          <div className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-5">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h3 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mb-2">Spot reserved! 🤙</h3>
            <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6">We&apos;ll send your deposit payment link right away and contact you personally to sort every detail.</p>
            <button onClick={onClose} className="px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-black tracking-[-0.02em] text-[#00374a]">Reserve your spot</h3>
                <p className="text-[13px] text-[#6a7a80] mt-1">
                  {ctx.experienceTitle}
                  {ctx.editionLabel ? ` · ${ctx.editionLabel}` : ""}
                  {ctx.editionDates ? ` · ${ctx.editionDates}` : ""}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-[#f1f5f6] text-[#5a6b72] hover:bg-[#e4ebee]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* selection summary */}
            <div className="rounded-2xl bg-[#f7fbfc] border border-[#e6eef0] px-5 py-4 mb-6">
              <div className="flex items-center justify-between gap-3 text-[14px]">
                <span className="font-bold text-[#00374a]">{ctx.level} · {ctx.accommodation}</span>
                <span className="font-bold text-[#00374a] shrink-0">{fmt(ctx.price)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-[#e6eef0] text-[13.5px]">
                <span className="text-[#5a6b72]">Due today to reserve</span>
                <span className="font-black text-[#00afdb] text-[16px] shrink-0">{fmt(DEPOSIT_EUR)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name"
                className="px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]" />
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name"
                className="px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]" />
            </div>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email"
              className="w-full px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac] mb-3" />
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (incl. country code)" autoComplete="tel"
              className="w-full px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac] mb-5" />

            {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

            <button type="submit" disabled={submitting}
              className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
              {submitting ? "One sec…" : `Reserve now · pay ${fmt(DEPOSIT_EUR)} deposit`}
            </button>

            <ul className="mt-5 space-y-2">
              {[
                "That's it — no forms, no paperwork. After payment we contact you personally for everything else.",
                "Flying in earlier or out later? Add extra hotel nights with us anytime after booking.",
                `The remaining balance (${fmt(Math.max(ctx.price - DEPOSIT_EUR, 0))}) is due later — we'll sort it together.`,
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-[12.5px] text-[#7a8a90] leading-relaxed">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#00afdb]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  {t}
                </li>
              ))}
            </ul>
          </form>
        )}
      </div>
    </div>
  );
}
