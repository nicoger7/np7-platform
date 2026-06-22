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

  function select(id: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("id", id);
    router.push(`/admin/members?${sp.toString()}`, { scroll: false });
    // Start the split at the top — otherwise selecting from a scrolled-down
    // list leaves the sticky rail mid-scroll (the "empty card" glitch).
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
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

  function toggleLevelView() {
    setLevelView((v) => {
      const next = !v;
      if (next && segment === "all") setSegment("participants");
      return next;
    });
  }

  const inputCls = "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";

  // One row renderer for both the full grid (compact=false) and the rail (compact=true).
  function row(m: Member, compact: boolean) {
    const active = selectedId === m.id;
    const badges = (
      <>
        {!m.hasAccount && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400">No account</span>}
        {m.banned && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Deactivated</span>}
        {m.marketing && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">Newsletter</span>}
        {(m.level || m.selfLevel) && (
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${levelTone(m.levelStatus)}`}>
            {m.level ?? m.selfLevel}{m.levelStatus && m.levelStatus !== "verified" ? ` · ${m.levelStatus}` : ""}
          </span>
        )}
      </>
    );
    const actions = (
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
    );

    return (
      <div
        key={m.id}
        onClick={() => select(m.id)}
        className={`cursor-pointer rounded-xl border transition-colors ${compact ? "shrink-0 px-3.5 py-3" : "px-5 py-4 hover:border-[var(--admin-border-strong)]"}`}
        style={active
          ? { backgroundColor: "var(--admin-accent-weak)", borderColor: "var(--admin-accent)" }
          : { backgroundColor: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold admin-heading truncate">{m.name || "Unnamed"}</span>
          {badges}
        </div>
        <p className="text-xs admin-faint truncate mt-0.5">
          {m.email || "—"} · {m.bookings} booking{m.bookings === 1 ? "" : "s"}
          {!compact && m.experiences.length > 0 && <> · {m.experiences.map((e) => e.title).join(", ")}</>}
          {!compact && m.hasAccount && <> · last login {fmtDate(m.lastSignIn)}</>}
        </p>
        <div className="mt-1.5">{actions}</div>
      </div>
    );
  }

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2.5 mb-4">
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
      <span className="text-[12px] admin-faint ml-auto">{loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "person" : "people"}`}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Member Management</h1>
          <p className="text-sm admin-muted mt-1">Customer accounts for the trip portal. Pick anyone to open their full details.</p>
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

      {filterBar}

      {!selectedId ? (
        /* ── No selection → the full members list (full width, all details) ── */
        <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
          {!loading && rows.length === 0 && <p className="text-sm admin-faint">No one matches these filters.</p>}
          {rows.map((m) => row(m, false))}
        </div>
      ) : (
        /* ── A member is selected → macOS-style columns: rail + detail ── */
        <div className="lg:flex lg:gap-6 lg:items-start">
          <aside className="hidden lg:flex flex-col gap-1.5 lg:w-[340px] lg:shrink-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:-mr-1 lg:pr-1">
            {rows.map((m) => row(m, true))}
          </aside>
          <section className="flex-1 min-w-0">
            <MemberDetailPane contactId={selectedId} initialTab={levelView ? "level" : "overview"} onBack={clearSelection} />
          </section>
        </div>
      )}
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
