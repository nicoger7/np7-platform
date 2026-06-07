"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || `Login failed (${res.status})`);
        return;
      }

      window.location.href = "/admin/dashboard";
    } catch (err) {
      setError(`Connection error: ${err instanceof Error ? err.message : "check console"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-10">
          <Link href="/" className="inline-block">
            <div className="bg-white text-[#111] w-12 h-12 rounded-[12px] flex items-center justify-center text-[17px] font-black mx-auto mb-4">
              NP7
            </div>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-[-0.02em]">
            Admin
          </h1>
          <p className="text-sm text-white/40 mt-1">Sign in to manage NP7</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/50 tracking-[0.1em] uppercase mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@np-seven.com"
              required
              className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm outline-none focus:border-[#0aa3c7] placeholder:text-white/25 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/50 tracking-[0.1em] uppercase mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm outline-none focus:border-[#0aa3c7] placeholder:text-white/25 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-full text-[13px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_16px_rgba(10,163,199,0.25)] hover:bg-[#087a95] transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-[11px] text-white/20 mt-8">
          NP7 Admin Panel — Team access only
        </p>
      </div>
    </div>
  );
}
