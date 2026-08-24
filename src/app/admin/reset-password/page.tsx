"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Where the password-reset email lands (via /account/auth/confirm, which has
 * already verified the recovery token and set the session cookies). All that's
 * left: choose a new password. Opened without a session — bookmarked, expired,
 * or by accident — it says so and points back to the login.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [session, setSession] = useState<"checking" | "ok" | "none">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ? "ok" : "none"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); setBusy(false); return; }
    router.push("/admin");
    router.refresh();
  }

  const input = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cdn/assets/logos/np7-logo.png" alt="NP7" className="h-10 w-auto invert mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white">Set a new password</h1>
          <p className="text-sm text-white/40 mt-1">For your NP7 admin account</p>
        </div>

        {session === "checking" ? (
          <p className="text-center text-sm text-white/40">One moment…</p>
        ) : session === "none" ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/60 leading-relaxed">
              This link has expired or was already used. Request a fresh one from the login page.
            </p>
            <a href="/admin/login" className="inline-block px-6 py-3 rounded-xl bg-[#0aa3c7] text-white text-sm font-bold">
              Back to login
            </a>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label htmlFor="pw" className="block text-xs font-medium text-white/50 mb-1.5">New password</label>
              <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} autoComplete="new-password" className={input} />
            </div>
            <div>
              <label htmlFor="pw2" className="block text-xs font-medium text-white/50 mb-1.5">Repeat it</label>
              <input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                required autoComplete="new-password" className={input} />
            </div>
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full py-3 rounded-xl bg-[#0aa3c7] hover:bg-[#0b8fb0] disabled:opacity-60 text-white text-sm font-bold transition-colors">
              {busy ? "Saving…" : "Save & go to admin"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
