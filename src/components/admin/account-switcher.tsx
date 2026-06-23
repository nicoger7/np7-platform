"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rememberAccount, listAccounts, forgetAccount, forgetAllAccounts, type StoredAccount } from "@/lib/admin-accounts";

/**
 * Quick account switcher in the admin sidebar footer. Remembers the accounts
 * used in this browser; once there are TWO, the email becomes a menu to swap
 * between them instantly (no password re-entry). Only shows the menu at 2+.
 */
export function AccountSwitcher({ currentEmail, currentUserId }: { currentEmail: string; currentUserId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Remember the live session (and keep it fresh as the token rotates).
  useEffect(() => {
    let active = true;
    const capture = (s: { user: { id: string; email?: string }; access_token: string; refresh_token: string } | null) => {
      if (s) rememberAccount({ id: s.user.id, email: s.user.email ?? currentEmail, access_token: s.access_token, refresh_token: s.refresh_token });
      if (active) setAccounts(listAccounts());
    };
    supabase.auth.getSession().then(({ data }) => capture(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => capture(session));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [supabase, currentEmail]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function switchTo(acc: StoredAccount) {
    setBusy(acc.id);
    const { error } = await supabase.auth.setSession({ access_token: acc.access_token, refresh_token: acc.refresh_token });
    if (error) {
      forgetAccount(acc.id);
      setAccounts(listAccounts());
      setBusy(null);
      alert(`Couldn't switch to ${acc.email} — that session expired. Please log in to it again.`);
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) rememberAccount({ id: data.session.user.id, email: data.session.user.email ?? acc.email, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    window.location.assign("/admin"); // full reload → SSR + middleware re-auth as the new account
  }

  function forget(id: string) {
    forgetAccount(id);
    setAccounts(listAccounts());
  }

  // Fewer than two accounts → just the plain email, no switcher (as requested).
  if (accounts.length < 2) {
    return <span className="text-xs truncate" style={{ color: "var(--admin-text-faint)" }}>{currentEmail}</span>;
  }

  const isCurrent = (a: StoredAccount) => a.id === currentUserId || a.email === currentEmail;
  const others = accounts.filter((a) => !isCurrent(a));

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 min-w-0 text-xs transition-colors hover:opacity-80"
        style={{ color: "var(--admin-text-faint)" }}
        title="Switch account"
      >
        <span className="truncate max-w-[150px]">{currentEmail}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-[230px] rounded-xl overflow-hidden shadow-lg z-50"
          style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--admin-text-faint)", borderBottom: "1px solid var(--admin-border)" }}>Switch account</div>
          {others.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-2 group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <button onClick={() => switchTo(a)} disabled={busy === a.id} className="flex-1 min-w-0 text-left text-xs hover:opacity-80 disabled:opacity-50" style={{ color: "var(--admin-text)" }}>
                <span className="block truncate">{a.name || a.email}</span>
                {a.name && <span className="block truncate text-[11px]" style={{ color: "var(--admin-text-faint)" }}>{a.email}</span>}
              </button>
              {busy === a.id
                ? <span className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>…</span>
                : <button onClick={() => forget(a.id)} title="Forget this account" className="text-[11px] opacity-0 group-hover:opacity-100 hover:text-red-400" style={{ color: "var(--admin-text-faint)" }}>✕</button>}
            </div>
          ))}
          <button
            onClick={() => { forgetAllAccounts(); setAccounts([]); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-[11px] hover:opacity-80"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Forget all accounts
          </button>
        </div>
      )}
    </div>
  );
}
