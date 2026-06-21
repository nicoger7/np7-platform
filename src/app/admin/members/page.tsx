"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MemberDetailPane } from "@/components/admin/member-detail-pane";

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

function MembersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");

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

  const load = useCallback(() => {
    fetch("/api/admin/members").then((r) => r.json()).then((d) => {
      setMembers(d.members ?? []); setGuests(d.guests ?? []); setExperiences(d.experiences ?? []);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  // push (not replace) so browser-back walks selections and lands on the list —
  // part of making "back" behave the way you'd expect.
  function select(id: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("id", id);
    router.push(`/admin/members?${sp.toString()}`, { scroll: false });
  }
  function clearSelection() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("id");
    router.push(`/admin/members${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }

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

  const inputCls = "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Member Management</h1>
          <p className="text-sm admin-muted mt-1">Customer accounts for the trip portal. Pick anyone to see their details on the right.</p>
        </div>
        <button
          onClick={toggleLevelView}
          className={`shrink-0 px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${levelView ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"}`}
          style={levelView ? undefined : { border: "1px solid var(--admin-border)" }}
        >
          {levelView ? "✓ Level view" : "Level view"}
        </button>
      </div>

      {toast && <div className="mb-3 text-[13px] font-semibold text-[#0aa3c7]">{toast}</div>}

      <div className="lg:flex lg:gap-6 lg:items-start">
        {/* ── Left rail: filters + the squashed, scrollable member list ── */}
        <aside className={`${selectedId ? "hidden lg:flex" : "flex"} flex-col lg:w-[360px] lg:shrink-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-9rem)]`}>
          <div className="flex flex-col gap-2 mb-3">
            <input className={inputCls} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex gap-2">
              <select className={`${inputCls} flex-1 min-w-0`} value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
                {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select className={`${inputCls} flex-1 min-w-0`} value={expId} onChange={(e) => setExpId(e.target.value)}>
                <option value="">All experiences</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[12px] admin-faint">{loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "person" : "people"}`}</p>
              {(q || segment !== "all" || expId) && (
                <button onClick={() => { setQ(""); setSegment("all"); setExpId(""); }} className="text-xs admin-muted hover:admin-heading">Clear filters</button>
              )}
            </div>
          </div>

          <div className="grid gap-1.5 lg:overflow-y-auto lg:flex-1 lg:-mr-1 lg:pr-1">
            {!loading && rows.length === 0 && <p className="text-sm admin-faint">No one matches these filters.</p>}
            {rows.map((m) => {
              const active = selectedId === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => select(m.id)}
                  className="cursor-pointer rounded-xl px-3.5 py-3 border transition-colors"
                  style={active
                    ? { backgroundColor: "var(--admin-accent-weak)", borderColor: "var(--admin-accent)" }
                    : { backgroundColor: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold admin-heading truncate">{m.name}</span>
                    {!m.hasAccount && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400">No account</span>}
                    {m.banned && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Off</span>}
                    {m.marketing && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">News</span>}
                    {(m.level || m.selfLevel) && (
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${levelTone(m.levelStatus)}`}>
                        {m.level ?? m.selfLevel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs admin-faint truncate mt-0.5">{m.email || "—"} · {m.bookings} booking{m.bookings === 1 ? "" : "s"}</p>
                  {/* Quick actions — don't trigger row selection */}
                  <div className="flex items-center gap-3 mt-1.5" onClick={(e) => e.stopPropagation()}>
                    {m.hasAccount ? (
                      <>
                        <button onClick={() => act("invite", m.id, "Login link sent")} disabled={!!busy} className="text-[11px] font-semibold text-[#0aa3c7] hover:underline disabled:opacity-50">Resend link</button>
                        {m.banned
                          ? <button onClick={() => act("reactivate", m.id, "Reactivated")} disabled={!!busy} className="text-[11px] font-semibold text-green-500 hover:underline disabled:opacity-50">Reactivate</button>
                          : <button onClick={() => act("deactivate", m.id, "Deactivated")} disabled={!!busy} className="text-[11px] font-semibold text-red-400 hover:underline disabled:opacity-50">Deactivate</button>}
                      </>
                    ) : (
                      <button onClick={() => act("invite", m.id, "Invite sent")} disabled={!!busy || !m.email}
                        className="text-[11px] font-bold text-[#0aa3c7] hover:underline disabled:opacity-50">
                        {busy === m.id + "invite" ? "Sending…" : "Invite to portal →"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Right pane: the selected member's detail ── */}
        <section className={`${selectedId ? "block" : "hidden lg:block"} flex-1 min-w-0 mt-4 lg:mt-0`}>
          {selectedId ? (
            <MemberDetailPane contactId={selectedId} initialTab={levelView ? "level" : "overview"} onBack={clearSelection} />
          ) : (
            <div className="hidden lg:flex items-center justify-center h-[60vh] rounded-2xl border border-dashed" style={{ borderColor: "var(--admin-border)" }}>
              <p className="text-sm admin-faint">Select a member to see their details</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm admin-faint">Loading…</div>}>
      <MembersInner />
    </Suspense>
  );
}
