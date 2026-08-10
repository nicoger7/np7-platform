"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * After a first magic-link login, gently suggest setting a password for faster
 * sign-in next time. The server decides whether to show it (`show`): only when
 * the account has no password and the member hasn't dismissed it in the last 30
 * days. Dismissal is stamped into account metadata (cross-device) — so after the
 * cooldown it surfaces once more, until they set a password.
 */
export function SetPasswordPrompt({ show }: { show: boolean }) {
  const [closed, setClosed] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  if (!show || closed) return null;

  async function dismiss() {
    // Persist the dismissal on the account so it sticks across devices/tabs; the
    // server re-shows it after the cooldown.
    setErr("");
    const wasClosed = closed;
    setClosed(true); // optimistic: the card goes the moment they click
    const { error } = await createClient().auth.updateUser({
      data: { pw_prompt_dismissed_at: new Date().toISOString() },
    });
    if (error) {
      // Swallowed, this cost the member the thing they just asked for: "Maybe
      // later" never reached the account, so the same prompt was waiting at the
      // next sign-in and on every other device — nagging that looks like a bug.
      // Put the card back so the dismissal can actually be retried.
      setClosed(wasClosed);
      setErr("Couldn't save that. This reminder will come back next time you sign in — tap Maybe later again to try once more.");
    }
  }

  async function save() {
    setErr("");
    if (password.length < 8) { setErr("Use at least 8 characters."); return; }
    setBusy(true);
    const res = await fetch("/api/portal/account/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || "Could not set your password."); return; }
    // The set-password route flags has_password=true, so the server won't show
    // this again — just confirm, then close.
    setDone(true);
    setTimeout(() => setClosed(true), 2200);
  }

  if (done) {
    return (
      <div className="mb-6 rounded-2xl bg-[#e1f5ee] border border-[#bfe6d7] px-5 py-3.5 text-[14px] text-[#0f6e56] font-semibold">
        Password set — you can use it next time you sign in. ✓
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl bg-white border border-[#f0e6d6] p-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-full bg-[#eaf6f9] text-[#00afdb] inline-flex items-center justify-center">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-[#00374a]">Set a password for faster sign-in</p>
          <p className="text-[13px] text-[#5a6b72] mt-0.5">You signed in with a magic link. Add a password so next time you can log in instantly — or keep using magic links, your call.</p>

          {!open ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setOpen(true)} className="rounded-lg bg-[#0f6e56] text-white text-[13px] font-bold px-4 py-2">Set a password</button>
              <button onClick={dismiss} className="rounded-lg text-[#5a6b72] text-[13px] font-semibold px-4 py-2 hover:bg-[#f4f0e8]">Maybe later</button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                className="flex-1 rounded-lg border border-[#d8e3e6] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#00afdb]"
              />
              <button onClick={save} disabled={busy} className="rounded-lg bg-[#0f6e56] text-white text-[14px] font-bold px-5 py-2.5 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            </div>
          )}
          {err && <p className="mt-2 text-[13px] text-[#c0392b]">{err}</p>}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-[#b6c2c6] hover:text-[#5a6b72]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
