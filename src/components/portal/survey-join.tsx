"use client";

import { useState } from "react";

/** Open-link landing card: name + email → personal invite token → straight
 *  into the normal survey flow (same email always resumes its own answer). */
export function SurveyJoin({ openToken }: { openToken: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  /**
   * Answering a survey is not consent to be marketed to. Unticked by default,
   * worded separately, and never a condition of taking part — otherwise it is
   * not freely given and the whole list is unusable.
   */
  const [optIn, setOptIn] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — humans never see it
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/survey/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: openToken, name, email, website, optIn }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.token) { setError(j.error || "Something went wrong — please try again."); return; }
      // full navigation: the personal page is server-rendered off the new invite
      window.location.assign(`/survey/${j.token}`);
    } catch {
      setError("Something went wrong — please try again.");
    } finally { setBusy(false); }
  }

  const input = "w-full rounded-xl border border-[#e3d5b8] bg-white text-[#0a2a33] placeholder:text-[#b6a880] px-4 py-3 text-[15px] outline-none focus:border-[#b0791e] transition-colors";

  return (
    <form onSubmit={join} className="rounded-2xl border border-[#ecdcbb] bg-white p-6 sm:p-8 shadow-[0_10px_30px_rgba(120,90,20,0.06)]">
      <h2 className="text-[19px] font-black text-[#00374a]">First — who are you? 🤙</h2>
      <p className="text-[14px] text-[#6a7a80] mt-1.5">Leave your name and email and you&apos;re in — you&apos;ll get your own personal link, and coming back with the same email picks up right where you left off.</p>
      <div className="grid gap-3 mt-5 sm:grid-cols-2">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required maxLength={80} />
        <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required maxLength={120} />
      </div>
      {/* honeypot: hidden from humans, tempting to bots */}
      <input className="absolute opacity-0 pointer-events-none h-0 w-0" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" name="website" />
      <label className="flex items-start gap-2.5 mt-4 cursor-pointer select-none">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 accent-[#f0a500]" />
        <span className="text-[13.5px] text-[#6a7a80] leading-relaxed">
          Also keep me posted on NP7 trips — a handful of emails a year, unsubscribe any time.
          <span className="block text-[12.5px] text-[#9aa6ac]">Optional. Your answer counts either way.</span>
        </span>
      </label>
      {error && <p className="text-[13px] font-semibold text-[#c0392b] mt-3">{error}</p>}
      <button type="submit" disabled={busy || !name.trim() || !email.trim()}
        className="mt-5 w-full sm:w-auto rounded-full px-8 py-3.5 text-[15px] font-black text-[#3a2a00] disabled:opacity-50 transition-transform active:scale-[0.98]"
        style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 60%,#f47b20)" }}>
        {busy ? "One sec…" : "Continue to the dates →"}
      </button>
      <p className="text-[12px] text-[#9a8a6a] mt-3.5">Only used so we can count you in and get back to you about this trip — no newsletter, no spam.</p>
      {/* Members skip the form entirely: log in → bounce back here → auto-join
          with their account contact (server-side on this page). */}
      <p className="text-[12.5px] text-[#9a8a6a] mt-4 pt-4 border-t border-[#f2e8d2]">
        Have an NP7 account?{" "}
        <a href={`/account/login?next=${encodeURIComponent(`/survey/${openToken}`)}`} className="font-bold text-[#b0791e] hover:underline">Log in</a>
        {" "}— we&apos;ll fill in your details automatically.
      </p>
    </form>
  );
}
