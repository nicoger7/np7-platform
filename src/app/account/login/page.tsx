"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { NP7_LOGO } from "@/components/experience/ocean-header";

export default function AccountLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    await fetch("/api/portal/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true); setBusy(false);
  }

  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("Wrong email or password."); setBusy(false); return; }
    router.push("/account"); router.refresh();
  }

  return (
    <main className="min-h-[100svh] bg-[#00374a] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_LOGO} alt="NP7" className="h-8 w-auto invert mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white tracking-[-0.02em]">My NP7</h1>
          <p className="text-[14px] text-white/55 mt-1">Sign in to manage your trip</p>
        </div>

        {sent ? (
          <div className="bg-white rounded-2xl p-7 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#00afdb]/10 text-[#00afdb] grid place-items-center mb-4">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="m4 6 8 6 8-6" /></svg>
            </div>
            <h2 className="text-[17px] font-bold text-[#00374a] mb-1.5">Check your inbox</h2>
            <p className="text-[14px] text-[#6a7a80] leading-relaxed">If an account exists for <strong>{email}</strong>, we&apos;ve sent a secure login link. It expires shortly, so use it soon.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-7">
            <form onSubmit={usePassword ? passwordLogin : magicLink} className="space-y-3">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" autoComplete="email"
                className="w-full px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]" />
              {usePassword && (
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"
                  className="w-full px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]" />
              )}
              {error && <p className="text-[13px] text-red-500">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full px-7 py-3.5 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
                {busy ? "One sec…" : usePassword ? "Log in" : "Email me a login link"}
              </button>
            </form>
            <button onClick={() => { setUsePassword((v) => !v); setError(""); }}
              className="w-full text-center text-[12.5px] font-semibold text-[#00afdb] mt-4 hover:underline">
              {usePassword ? "Use a login link instead" : "I have a password"}
            </button>
          </div>
        )}

        <p className="text-center text-[12px] text-white/40 mt-6">
          Booked a trip but no account yet? <Link href="/experience" className="text-white/70 hover:text-white">Find your trip →</Link>
        </p>
      </div>
    </main>
  );
}
