"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { AdminMemberLevel } from "@/components/admin/admin-member-level";

type Exp = { id: string; title: string; secured: boolean };
type Member = {
  id: string; name: string; email: string | null; bookings: number;
  hasAccount: boolean; marketing: boolean; lastSignIn: string | null; banned: boolean;
  experiences: Exp[]; participant: boolean;
  level: string | null; levelStatus: string | null; selfLevel: string | null;
};

type Segment = "all" | "participants" | "account" | "noaccount" | "newsletter" | "deactivated";
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "participants", label: "Experience participants" },
  { key: "account", label: "Has account" },
  { key: "noaccount", label: "No account" },
  { key: "newsletter", label: "Newsletter" },
  { key: "deactivated", label: "Deactivated" },
];

const levelTone = (status: string | null) =>
  status === "verified" ? "bg-green-500/15 text-green-500" : status === "suggested" ? "bg-amber-500/15 text-amber-500" : "bg-slate-500/15 text-slate-400";

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [guests, setGuests] = useState<Member[]>([]);
  const [experiences, setExperiences] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [toast, setToast] = useState("");

  // filters
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [expId, setExpId] = useState("");
  const [levelView, setLevelView] = useState(false);
  const [openLevel, setOpenLevel] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch("/api/admin/members").then((r) => r.json()).then((d) => {
      setMembers(d.members ?? []); setGuests(d.guests ?? []); setExperiences(d.experiences ?? []);
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

  const all = useMemo(() => [...members, ...guests], [members, guests]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((m) => {
      if (needle && !(`${m.name} ${m.email ?? ""}`.toLowerCase().includes(needle))) return false;
      if (expId && !m.experiences.some((e) => e.id === expId)) return false;
      switch (segment) {
        case "participants": return m.participant || (levelView && m.experiences.length > 0);
        case "account": return m.hasAccount;
        case "noaccount": return !m.hasAccount;
        case "newsletter": return m.marketing;
        case "deactivated": return m.banned;
        default: return true;
      }
    });
  }, [all, q, expId, segment, levelView]);

  // In level view, default to the people who can actually have a level (participants).
  function toggleLevelView() {
    setLevelView((v) => {
      const next = !v;
      if (next && segment === "all") setSegment("participants");
      return next;
    });
  }
  const toggleOpen = (id: string) => setOpenLevel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const inputCls = "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Member Management</h1>
          <p className="text-sm admin-muted mt-1">Customer accounts for the trip portal. Filter, invite, manage access — and review riders&apos; levels.</p>
        </div>
        <button
          onClick={toggleLevelView}
          className={`shrink-0 px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${levelView ? "bg-[#0aa3c7] text-white" : "admin-muted"}`}
          style={levelView ? undefined : { border: "1px solid var(--admin-border)" }}
        >
          {levelView ? "✓ Level view" : "Level view"}
        </button>
      </div>

      {toast && <div className="mt-3 text-[13px] font-semibold text-[#0aa3c7]">{toast}</div>}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2.5 mt-5 mb-6">
        <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
          {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className={inputCls} value={expId} onChange={(e) => setExpId(e.target.value)}>
          <option value="">All experiences</option>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        {(q || segment !== "all" || expId) && (
          <button onClick={() => { setQ(""); setSegment("all"); setExpId(""); }} className="px-3 py-2 text-xs admin-muted rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>Clear</button>
        )}
      </div>

      {loading ? <p className="text-sm admin-faint">Loading…</p> : (
        <>
          <p className="text-[12px] admin-faint mb-3">{rows.length} {rows.length === 1 ? "person" : "people"}{levelView ? " · click a row to set their level" : ""}</p>
          <div className="grid gap-2">
            {rows.length === 0 && <p className="text-sm admin-faint">No one matches these filters.</p>}
            {rows.map((m) => {
              const isOpen = openLevel.has(m.id);
              return (
                <div key={m.id} className="admin-surface admin-border border rounded-xl px-5 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/admin/members/${m.id}`} className="font-semibold admin-heading truncate hover:text-[#0aa3c7] transition-colors">{m.name}</Link>
                        {!m.hasAccount && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-500/15 text-slate-400">No account</span>}
                        {m.banned && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-400">Deactivated</span>}
                        {m.marketing && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-green-500/15 text-green-500">Newsletter</span>}
                        {(m.level || m.selfLevel) && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${levelTone(m.levelStatus)}`}>
                            {m.level ?? m.selfLevel}{m.levelStatus && m.levelStatus !== "verified" ? ` · ${m.levelStatus}` : ""}
                          </span>
                        )}
                      </div>
                      <span className="text-xs admin-faint">
                        {m.email} · {m.bookings} booking{m.bookings === 1 ? "" : "s"}
                        {m.experiences.length > 0 && <> · {m.experiences.map((e) => e.title).join(", ")}</>}
                        {m.hasAccount && <> · last login {fmtDate(m.lastSignIn)}</>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {levelView ? (
                        <button onClick={() => toggleOpen(m.id)} className="text-[12px] font-bold text-[#0aa3c7] hover:underline">{isOpen ? "Close" : "Set level"}</button>
                      ) : m.hasAccount ? (
                        <>
                          <button onClick={() => act("invite", m.id, "Login link sent")} disabled={!!busy} className="text-[12px] font-semibold text-[#0aa3c7] hover:underline disabled:opacity-50">Resend link</button>
                          {m.banned
                            ? <button onClick={() => act("reactivate", m.id, "Reactivated")} disabled={!!busy} className="text-[12px] font-semibold text-green-500 hover:underline disabled:opacity-50">Reactivate</button>
                            : <button onClick={() => act("deactivate", m.id, "Deactivated")} disabled={!!busy} className="text-[12px] font-semibold text-red-400 hover:underline disabled:opacity-50">Deactivate</button>}
                        </>
                      ) : (
                        <button onClick={() => act("invite", m.id, "Invite sent")} disabled={!!busy || !m.email}
                          className="px-4 py-2 rounded-lg text-[12px] font-bold bg-[#0aa3c7] text-white hover:bg-[#0aa3c7]/90 disabled:opacity-50">
                          {busy === m.id + "invite" ? "…" : "Invite to portal"}
                        </button>
                      )}
                    </div>
                  </div>
                  {levelView && isOpen && (
                    <div className="mt-4 pt-4 border-t admin-border">
                      <AdminMemberLevel contactId={m.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
