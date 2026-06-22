"use client";

import { useState } from "react";

/**
 * Friend-side signup on the public /join/[token] page. Posts to the existing
 * free-registration funnel (/api/register) with the invite token so the new
 * booking is attributed back to the inviter. No payment here — registration is
 * free and holds no spot; the downpayment happens later from their account.
 */
export function JoinSignup({
  experienceId,
  editionId,
  packageId,
  inviteToken,
  defaultName = "",
  defaultEmail = "",
  ctaLabel = "Reserve my spot",
}: {
  experienceId: string;
  editionId: string | null;
  packageId: string | null;
  inviteToken: string;
  /** Pre-filled from the invite (the member already gave us these) — one-tap join. */
  defaultName?: string;
  defaultEmail?: string;
  ctaLabel?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [optIn, setOptIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setErr("");
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr("Please enter a valid email address."); return; }
    if (!packageId) { setErr("This trip isn't open for signup right now."); return; }
    setBusy(true);
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experienceId, editionId, packageId,
        firstName, lastName: rest.join(" "),
        email: email.trim(), marketingOptIn: optIn, inviteToken,
      }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || "Something went wrong. Please try again."); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl bg-[#e1f5ee] border border-[#bfe6d7] p-5 text-center">
        <p className="text-[16px] font-bold text-[#0f6e56]">You&apos;re on the list! 🌊</p>
        <p className="text-[14px] text-[#0f6e56] mt-1.5 leading-relaxed">We&apos;ve sent a sign-in link to <strong>{email.trim()}</strong>. Open it to access your account and secure your spot.</p>
        <a href="/account/login" className="inline-block mt-3 rounded-lg bg-[#00374a] text-white text-[14px] font-semibold px-5 py-2.5">Go to my account</a>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-[#d8e3e6] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#00afdb] transition-colors";
  return (
    <div className="space-y-2.5">
      <input className={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={input} type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="flex items-start gap-2.5 text-[13px] text-[#5a6b72] cursor-pointer py-1">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
        <span>Keep me posted about trips, dates and tips. You can unsubscribe any time.</span>
      </label>
      {err && <p className="text-[13px] text-[#c0392b]">{err}</p>}
      <button onClick={submit} disabled={busy} className="w-full rounded-lg bg-[#0f6e56] text-white text-[15px] font-bold py-3 disabled:opacity-50">
        {busy ? "Saving…" : ctaLabel}
      </button>
      <p className="text-[12px] text-[#94a3a8] text-center">Free to hold · fully refundable for 14 days · no card needed now</p>
    </div>
  );
}
