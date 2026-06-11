"use client";

import { useEffect, useState, useCallback } from "react";

type Member = {
  id: string; name: string; email: string | null; bookings: number;
  hasAccount: boolean; marketing: boolean; lastSignIn: string | null; banned: boolean;
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [guests, setGuests] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/members").then((r) => r.json()).then((d) => {
      setMembers(d.members ?? []); setGuests(d.guests ?? []);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function act(action: string, contactId: string, label: string) {
    setBusy(contactId + action);
    const res = await fetch("/api/admin/members", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, contactId }),
    });
    setBusy("");
    if (res.ok) { setToast(label); setTimeout(() => setToast(""), 2500); load(); }
    else { const j = await res.json().catch(() => ({})); setToast(j.error ?? "Failed"); setTimeout(() => setToast(""), 3000); }
  }

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <h1 className="text-2xl font-bold admin-heading">Member Management</h1>
      <p className="text-sm admin-muted mt-1 mb-6">Customer accounts for the trip portal. Invite guests, resend login links, or deactivate access.</p>

      {toast && <div className="mb-4 text-[13px] font-semibold text-[#0aa3c7]">{toast}</div>}

      {loading ? <p className="text-sm admin-faint">Loading…</p> : (
        <>
          <h2 className="text-[12px] font-bold tracking-[0.15em] uppercase admin-faint mb-3">Members ({members.length})</h2>
          <div className="grid gap-2 mb-9">
            {members.length === 0 && <p className="text-sm admin-faint">No member accounts yet.</p>}
            {members.map((m) => (
              <div key={m.id} className="admin-surface admin-border border rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold admin-heading truncate">{m.name}</span>
                    {m.banned && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-400">Deactivated</span>}
                    {m.marketing && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-green-500/15 text-green-500">Newsletter</span>}
                  </div>
                  <span className="text-xs admin-faint">{m.email} · {m.bookings} booking{m.bookings === 1 ? "" : "s"} · last login {fmtDate(m.lastSignIn)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => act("invite", m.id, "Login link sent")} disabled={!!busy} className="text-[12px] font-semibold text-[#0aa3c7] hover:underline disabled:opacity-50">Resend link</button>
                  {m.banned
                    ? <button onClick={() => act("reactivate", m.id, "Reactivated")} disabled={!!busy} className="text-[12px] font-semibold text-green-500 hover:underline disabled:opacity-50">Reactivate</button>
                    : <button onClick={() => act("deactivate", m.id, "Deactivated")} disabled={!!busy} className="text-[12px] font-semibold text-red-400 hover:underline disabled:opacity-50">Deactivate</button>}
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-[12px] font-bold tracking-[0.15em] uppercase admin-faint mb-3">Guests without an account ({guests.length})</h2>
          <div className="grid gap-2">
            {guests.length === 0 && <p className="text-sm admin-faint">Everyone with a booking has an account.</p>}
            {guests.map((g) => (
              <div key={g.id} className="admin-surface admin-border border rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="font-semibold admin-heading truncate block">{g.name}</span>
                  <span className="text-xs admin-faint">{g.email} · {g.bookings} booking{g.bookings === 1 ? "" : "s"}</span>
                </div>
                <button onClick={() => act("invite", g.id, "Invite sent")} disabled={!!busy || !g.email}
                  className="shrink-0 px-4 py-2 rounded-lg text-[12px] font-bold bg-[#0aa3c7] text-white hover:bg-[#0aa3c7]/90 disabled:opacity-50">
                  {busy === g.id + "invite" ? "…" : "Invite to portal"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
