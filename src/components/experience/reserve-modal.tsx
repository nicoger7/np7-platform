"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics-client";

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
 * Free, low-friction registration. Guests give just First name · Last name ·
 * Email (+ optional marketing consent) — no phone, no payment. Registering
 * creates a lead; the refundable downpayment that SECURES the spot happens later
 * from the member account. Logged-in members skip the form (one-tap register).
 */
export function ReserveModal({ ctx, onClose }: { ctx: ReserveContext; onClose: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [member, setMember] = useState(false);
  const [ready, setReady] = useState(false);

  // The modal only mounts once the visitor clicks "Reserve" → start of the funnel.
  useEffect(() => {
    track("reserve_start", { package: ctx.packageId, level: ctx.level });
  }, [ctx.packageId, ctx.level]);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.loggedIn) {
          setMember(true);
          setFirstName(d.firstName ?? ""); setLastName(d.lastName ?? ""); setEmail(d.email ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const symbol = ctx.currency === "EUR" || !ctx.currency ? "€" : `${ctx.currency} `;
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-US")}`;

  async function go() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: ctx.experienceId,
          editionId: ctx.editionId,
          packageId: ctx.packageId,
          firstName, lastName, email, marketingOptIn,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Something went wrong — please try again."); setSubmitting(false); return; }
      track("register", { package: ctx.packageId, member });
      setRegistered(true);
      setSubmitting(false);
    } catch {
      setError("Something went wrong — please try again.");
      setSubmitting(false);
    }
  }

  async function logoutAndRegisterAsGuest() {
    await createClient().auth.signOut().catch(() => {});
    setMember(false);
    setFirstName(""); setLastName(""); setEmail("");
  }

  const inputCls = "px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]";

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Register for the clinic">
      <button className="absolute inset-0 bg-[#00141d]/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-[460px] bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_30px_80px_rgba(0,20,30,0.4)] max-h-[92svh] overflow-y-auto">
        {registered ? (
          <div className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-5">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h3 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mb-2">You&apos;re registered! 🤙</h3>
            <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6">We&apos;ve emailed you how it works. When you&apos;re ready, <strong>secure your spot</strong> with the refundable downpayment in your account — no rush, you&apos;ve got time.</p>
            <a href="/account" className="inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]">Open my account</a>
            <button onClick={onClose} className="block w-full mt-3 text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a]">Done</button>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-black tracking-[-0.02em] text-[#00374a]">Register for the clinic</h3>
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
                <span className="text-[#5a6b72]">Due today to register</span>
                <span className="font-black text-[#00afdb] text-[15px] shrink-0">Free</span>
              </div>
            </div>

            {/* what happens next */}
            <div className="mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9aa6ac] mb-2.5">How it works</p>
              <ol className="space-y-2">
                {[
                  "Register free today — no payment, no commitment.",
                  "We email you how it works & set up your account.",
                  `Secure your spot with the refundable ${fmt(DEPOSIT_EUR)} downpayment — 14 days to change your mind.`,
                  "Plan it in your account — flights, extra nights & your team.",
                  "Pay the balance later, then show up & ride.",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#5a6b72] leading-snug">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#00afdb]/12 text-[#0782a0] grid place-items-center text-[11px] font-bold">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </div>

            {!ready ? (
              <div className="py-8 text-center text-[13px] text-[#9aa6ac]">One sec…</div>
            ) : member ? (
              <>
                <div className="rounded-2xl border border-[#cdeefa] bg-[#00afdb]/8 px-5 py-4 mb-5">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#0782a0] mb-1">Registering as</p>
                  <p className="text-[15px] font-bold text-[#00374a]">{firstName} {lastName}</p>
                  <p className="text-[13px] text-[#5a6b72] mt-0.5 break-all">{email}</p>
                </div>
                {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}
                <button onClick={go} disabled={submitting}
                  className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
                  {submitting ? "One sec…" : "Register me — free"}
                </button>
                <button onClick={logoutAndRegisterAsGuest} disabled={submitting}
                  className="w-full mt-3 text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a] transition-colors disabled:opacity-60">
                  Not you? Log out &amp; register as someone else
                </button>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); go(); }}>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" className={inputCls} />
                  <input required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" className={inputCls} />
                </div>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className={`w-full mb-4 ${inputCls}`} />

                <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
                  <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
                  <span className="text-[12.5px] text-[#5a6b72] leading-snug">Keep me posted on trips, tips &amp; the odd offer. <span className="text-[#9aa6ac]">(optional — you&apos;ll still get everything about your booking)</span></span>
                </label>

                {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

                <button type="submit" disabled={submitting}
                  className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
                  {submitting ? "One sec…" : "Register free"}
                </button>
                <p className="mt-3 text-center text-[12px] text-[#9aa6ac]">No payment now. Your spot is secured later with a refundable downpayment.</p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
