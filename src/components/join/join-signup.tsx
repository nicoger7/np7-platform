"use client";

import { useState, useEffect, useRef } from "react";
import type { CountryOption } from "@/lib/countries";

/**
 * Friend-side signup on the public /join/[token] page. Posts to the existing
 * free-registration funnel (/api/register) with the invite token so the new
 * booking is attributed back to the inviter. No payment here — registration is
 * free and holds no spot; the downpayment happens later from their account.
 */

/** The red line under the form, or "" when the form can be sent. Pure, so the
 *  order of the checks is pinned by a test and not only by clicking. */
export function joinFormError(f: {
  name: string;
  email: string;
  packageId: string | null;
  askCountry: boolean;
  country: string;
}): string {
  if (!f.name.trim()) return "Please enter your name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return "Please enter a valid email address.";
  // A trip that cannot be joined says so before asking for anything more.
  if (!f.packageId) return "This trip isn't open for signup right now.";
  if (f.askCountry && !f.country) return "Please choose the country you live in.";
  return "";
}

/** What the form posts to /api/register. `country` only when the question was
 *  asked and answered, exactly as the reserve modal sends it. */
export function joinRegisterBody(f: {
  experienceId: string;
  editionId: string | null;
  packageId: string | null;
  name: string;
  email: string;
  marketingOptIn: boolean;
  inviteToken: string;
  intent: "reserve" | "info";
  askCountry: boolean;
  country: string;
}): Record<string, unknown> {
  const [firstName, ...rest] = f.name.trim().split(/\s+/);
  return {
    experienceId: f.experienceId, editionId: f.editionId, packageId: f.packageId,
    firstName, lastName: rest.join(" "),
    email: f.email.trim(), marketingOptIn: f.marketingOptIn, inviteToken: f.inviteToken, intent: f.intent,
    ...(f.askCountry && f.country ? { country: f.country } : {}),
  };
}

/** The dropdown's own name for the country /api/geo says they browse from,
 *  or null. Only a name the list offers, so the pick is always one the
 *  server keeps (lib/signup-country). */
export function geoCountryName(countries: CountryOption[] | null | undefined, code: unknown): string | null {
  if (typeof code !== "string" || !code) return null;
  return countries?.find((c) => c.code === code)?.name ?? null;
}

export function JoinSignup({
  experienceId,
  editionId,
  packageId,
  inviteToken,
  defaultName = "",
  defaultEmail = "",
  countries,
}: {
  experienceId: string;
  editionId: string | null;
  packageId: string | null;
  inviteToken: string;
  /** Pre-filled from the invite (the member already gave us these) — one-tap join. */
  defaultName?: string;
  defaultEmail?: string;
  /** The "Country you live in" list, built on the SERVER (countryOptions) and
   *  handed down, like the reserve modal's, so the name a friend picks is the
   *  exact string /api/register stores and guestCountry reads back. */
  countries?: CountryOption[];
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [optIn, setOptIn] = useState(true);
  /*
   * Where the friend lives (review follow-up, 28 Sep 2026).
   *
   * The reserve modal has asked this since 27 Sep: which ways to pay online a
   * guest is offered depends on their country, and a guest who arrived with
   * none could not pay online from their trip page until they found the
   * billing address box. A friend joining through an invite link lands on the
   * same trip page with the same gap, so they are asked the same way:
   * pre-selected from where they are browsing, changeable, required.
   * /api/register stores it only into an empty contacts.country.
   */
  const [country, setCountry] = useState("");
  /** They chose it themselves: nothing may pre-select over that. A ref, so
   *  the geo answer that lands after the pick reads it on the same tick. */
  const countryPicked = useRef(false);
  const askCountry = !!countries?.length;
  const [busy, setBusy] = useState<null | "reserve" | "info">(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | "reserve" | "info">(null);

  // Stick the invite token in a cookie so it survives the friend browsing the
  // public site first — /api/register falls back to it, crediting the inviter
  // wherever they eventually sign up.
  useEffect(() => {
    try { document.cookie = `np7_invite=${encodeURIComponent(inviteToken)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`; } catch { /* ignore */ }
  }, [inviteToken]);

  // Pre-select the country they are browsing from, once, while nothing is
  // chosen. Same /api/geo the reserve modal asks. A guess, shown and
  // changeable, never sent anywhere unless they sign up with it.
  useEffect(() => {
    if (!askCountry || country || countryPicked.current) return;
    let dead = false;
    fetch("/api/geo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || countryPicked.current) return;
        const hit = geoCountryName(countries, d?.country);
        if (hit) setCountry((prev) => prev || hit);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [askCountry, country, countries]);

  async function submit(intent: "reserve" | "info") {
    const problem = joinFormError({ name, email, packageId, askCountry, country });
    setErr(problem);
    if (problem) return;
    setBusy(intent);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(joinRegisterBody({
        experienceId, editionId, packageId, name, email,
        marketingOptIn: optIn, inviteToken, intent, askCountry, country,
      })),
    });
    setBusy(null);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || "Something went wrong. Please try again."); return; }
    setDone(intent);
  }

  if (done) {
    const reserved = done === "reserve";
    return (
      <div className="rounded-xl bg-[#e1f5ee] border border-[#bfe6d7] p-5 text-center">
        <p className="text-[16px] font-bold text-[#0f6e56]">{reserved ? "You're on the list! 🌊" : "On its way! 📨"}</p>
        <p className="text-[14px] text-[#0f6e56] mt-1.5 leading-relaxed">
          {reserved
            ? <>We&apos;ve sent a sign-in link to <strong>{email.trim()}</strong>. Open it to access your account and secure your spot.</>
            : <>We&apos;ve emailed the full details to <strong>{email.trim()}</strong>. No rush. Reserve your spot whenever you&apos;re ready.</>}
        </p>
        <a href="/account/login" className="inline-block mt-3 rounded-lg bg-[#00374a] text-white text-[14px] font-semibold px-5 py-2.5">Go to my account</a>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-[#d8e3e6] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#00afdb] transition-colors";
  return (
    <div className="space-y-2.5">
      <input className={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={input} type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
      {askCountry && (
        <div>
          {/* Grey while nothing is chosen, so the prompt reads as a placeholder,
              as in the reserve modal. */}
          <div className="relative">
            <select
              required
              aria-label="Country you live in"
              autoComplete="country-name"
              value={country}
              onChange={(e) => { countryPicked.current = true; setCountry(e.target.value); setErr(""); }}
              className={`w-full appearance-none bg-white rounded-lg border border-[#d8e3e6] pl-3.5 pr-10 py-2.5 text-[15px] outline-none focus:border-[#00afdb] transition-colors [&>option]:text-[#00374a] ${country ? "text-[#00374a]" : "text-[#9aa6ac]"}`}
            >
              <option value="" disabled>Country you live in</option>
              {(countries ?? []).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9aa6ac]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#9aa6ac] leading-snug">It decides which ways to pay online we can offer you.</p>
        </div>
      )}
      <label className="flex items-start gap-2.5 text-[13px] text-[#5a6b72] cursor-pointer py-1">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
        <span>Keep me posted about trips, dates and tips. You can unsubscribe any time.</span>
      </label>
      {err && <p className="text-[13px] text-[#c0392b]">{err}</p>}
      <button onClick={() => submit("reserve")} disabled={!!busy} className="w-full rounded-lg bg-[#0f6e56] text-white text-[15px] font-bold py-3 disabled:opacity-50">
        {busy === "reserve" ? "Saving…" : "Reserve my spot"}
      </button>
      <button onClick={() => submit("info")} disabled={!!busy} className="w-full rounded-lg border border-[#0f6e56] text-[#0f6e56] text-[14px] font-bold py-2.5 disabled:opacity-50">
        {busy === "info" ? "Sending…" : "Just send me the details first"}
      </button>
      <p className="text-[12px] text-[#94a3a8] text-center">Reserving is free · fully refundable for 14 days · no card needed now</p>
    </div>
  );
}
