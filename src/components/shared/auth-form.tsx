"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Mode = "login" | "magic" | "register";

/**
 * Shared member auth form. Password login is the primary path; magic-link and
 * "create account" are clear secondary options. Used both inside the AuthModal
 * popup and on the /account/login fallback page. `initialMode` lets a caller
 * (e.g. the blog signup gate) open straight into "create account".
 */
export function AuthForm({ onLoggedIn, compact = false, initialMode = "login", next: nextOverride }: { onLoggedIn?: () => void; compact?: boolean; initialMode?: Mode; /** Where to land after login (e.g. back to an open survey). Defaults to the page the form sits on. */ next?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<null | "magic" | "register">(null);

  function done() {
    if (onLoggedIn) return onLoggedIn();
    router.push(nextOverride || "/account");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    // Return the member to the page they logged in FROM (not the account home),
    // unless they're already in the account area.
    const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    const next = nextOverride || (here && !here.startsWith("/account") ? here : undefined);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError("Wrong email or password."); setBusy(false); return; }
        // They clearly have a password — make sure the account flag reflects that
        // so we stop nudging them to "set a password" (it's only set when the
        // password was created via the in-app prompt). Best-effort, non-blocking.
        supabase.auth.updateUser({ data: { has_password: true } }).catch(() => {});
        done();
        return;
      }
      if (mode === "magic") {
        await fetch("/api/portal/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, next }),
        });
        setSent("magic"); setBusy(false);
        return;
      }
      // register
      await fetch("/api/portal/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: `${firstName.trim()} ${lastName.trim()}`.trim(), next }),
      });
      setSent("register"); setBusy(false);
    } catch {
      setError("Something went wrong — please try again.");
      setBusy(false);
    }
  }

  const input = "w-full px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]";
  const linkBtn = "text-[12.5px] font-semibold text-[#00afdb] hover:underline";

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#00afdb]/10 text-[#00afdb] grid place-items-center mb-4">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="m4 6 8 6 8-6" /></svg>
        </div>
        <h2 className="text-[17px] font-bold text-[#00374a] mb-1.5">Check your inbox</h2>
        <p className="text-[14px] text-[#6a7a80] leading-relaxed">
          {sent === "register"
            ? <>We&apos;ve started your account and emailed a link to <strong>{email}</strong> to finish setting it up. You can add a password once you&apos;re in.</>
            : <>If an account exists for <strong>{email}</strong>, we&apos;ve sent a secure login link. It expires shortly, so use it soon.</>}
        </p>
        <button onClick={() => { setSent(null); setMode("login"); }} className={`${linkBtn} mt-5`}>← Back to log in</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "register" && (
        <>
          <div className="flex gap-3">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" className={input} />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" className={input} />
          </div>
          <p className="text-[11.5px] text-[#9aa6ac] -mt-1">Private — others only ever see your first name &amp; last initial (e.g. &ldquo;Nico P.&rdquo;), never your full name.</p>
        </>
      )}
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" autoComplete="email" className={input} />
      {mode === "login" && (
        <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className={input} />
      )}

      {error && <p className="text-[13px] text-red-500">{error}</p>}

      <button type="submit" disabled={busy}
        className="w-full px-7 py-3.5 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
        {busy ? "One sec…" : mode === "login" ? "Log in" : mode === "magic" ? "Email me a login link" : "Create account"}
      </button>

      {mode === "register" && (
        <p className="text-[12px] text-[#9aa6ac] leading-relaxed text-center pt-1">
          We&apos;ll email you a link to finish — no password needed to start.
        </p>
      )}

      <div className={`flex items-center justify-between gap-3 ${compact ? "pt-1" : "pt-2"}`}>
        {mode === "login" ? (
          <>
            <button type="button" onClick={() => { setMode("magic"); setError(""); }} className={linkBtn}>Email me a link instead</button>
            <button type="button" onClick={() => { setMode("register"); setError(""); }} className="text-[12.5px] font-semibold text-[#5a6b72] hover:text-[#00374a]">Create account</button>
          </>
        ) : (
          <button type="button" onClick={() => { setMode("login"); setError(""); }} className={linkBtn}>← Back to log in</button>
        )}
      </div>
    </form>
  );
}
