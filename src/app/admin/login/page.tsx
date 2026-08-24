"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // "Forgot password?" flips the same card into a reset-request form.
  const [mode, setMode] = useState<"login" | "forgot" | "forgot-sent">("login");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const supabase = createClient();

  // An expired reset link redirects here with ?error=expired (confirm route).
  // Read via window.location instead of useSearchParams — no Suspense dance.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "expired") {
      setNotice("That reset link has expired or was already used — request a new one below.");
      setMode("forgot");
    }
  }, []);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch { /* the answer is the same either way */ }
    setLoading(false);
    setMode("forgot-sent");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cdn/assets/logos/np7-logo.png"
            alt="NP7"
            className="h-10 w-auto invert mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-white">Admin Login</h1>
          <p className="text-sm text-white/40 mt-1">Sign in to manage NP7</p>
        </div>

        {mode === "forgot-sent" ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/60 leading-relaxed">
              If that address has an account, a reset link is on its way. It works once and expires after an hour.
            </p>
            <button onClick={() => { setMode("login"); setNotice(""); }} className="text-sm font-bold text-[#0aa3c7] hover:underline">
              Back to login
            </button>
          </div>
        ) : (
        <form onSubmit={mode === "forgot" ? requestReset : handleLogin} className="space-y-4">
          {notice && <p className="text-sm text-amber-400 text-center leading-relaxed">{notice}</p>}
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-white/50 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors"
              placeholder="you@np-seven.com"
            />
          </div>
          {mode === "login" && (
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-white/50 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors"
              placeholder="Password"
            />
          </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {mode === "forgot" ? (loading ? "Sending…" : "Send reset link") : loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center">
            <button type="button"
              onClick={() => { setMode(mode === "forgot" ? "login" : "forgot"); setError(""); setNotice(""); }}
              className="text-xs font-semibold text-white/40 hover:text-[#0aa3c7] transition-colors">
              {mode === "forgot" ? "← Back to login" : "Forgot password?"}
            </button>
          </p>
        </form>
        )}
      </div>
    </div>
  );
}
