"use client";

import { useEffect, useState } from "react";

type Grant = { id: string; role: string; destination_id: string | null; destinationName: string | null };
type Dest = { id: string; name: string };

/** Appoint a member as a Spotguide moderator (global) or local specialist (per
    destination). Moderators' edits/spots go live at once; a specialist's need
    just one confirm and their confirm alone clears anyone's. Local specialist
    standing is ALSO earned automatically in code — this is the manual grant. */
export function SpotguideTrust({ contactId }: { contactId: string }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [dests, setDests] = useState<Dest[]>([]);
  const [destId, setDestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);

  async function reloadGrants() {
    const d = await fetch(`/api/admin/spotguide/trust?contact=${contactId}`).then((r) => r.json());
    setGrants(d.grants ?? []); setNeedsMigration(!!d.needsMigration);
  }
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/spotguide/trust?contact=${contactId}`).then((r) => r.json()).then((d) => { if (alive) { setGrants(d.grants ?? []); setNeedsMigration(!!d.needsMigration); } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetch(`/api/admin/destinations`).then((r) => r.json()).then((d: any) => { if (alive && Array.isArray(d)) setDests(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))); }).catch(() => {});
    return () => { alive = false; };
  }, [contactId]);

  async function grant(role: "moderator" | "specialist") {
    if (role === "specialist" && !destId) { setMsg("Pick a destination first."); return; }
    setBusy(true); setMsg("");
    const r = await fetch(`/api/admin/spotguide/trust`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, role, destinationId: role === "specialist" ? destId : undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Couldn't grant."); return; }
    await reloadGrants();
    setMsg(j.already ? "Already granted." : role === "moderator" ? "✓ Now a moderator" : "✓ Now a local specialist");
  }
  async function revoke(id: string) {
    setBusy(true);
    await fetch(`/api/admin/spotguide/trust?id=${id}`, { method: "DELETE" });
    setBusy(false);
    setGrants((list) => list.filter((g) => g.id !== id));
  }

  const isMod = grants.some((g) => g.role === "moderator");
  const ctl = "text-xs px-2 py-1 rounded";
  const formEl: React.CSSProperties = { backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text)" };

  if (needsMigration) return <p className="text-xs admin-faint">Run migration 066 to enable Spotguide trust.</p>;

  return (
    <div className="space-y-3">
      {grants.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {grants.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <span className={g.role === "moderator" ? "text-[#0aa3c7]" : "text-green-500"}>{g.role === "moderator" ? "Moderator" : `Specialist · ${g.destinationName ?? "—"}`}</span>
              <button onClick={() => revoke(g.id)} disabled={busy} className="text-red-400/70 hover:text-red-400 disabled:opacity-50">✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || isMod} onClick={() => grant("moderator")} className={`${ctl} font-bold disabled:opacity-40`} style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>{isMod ? "Is a moderator" : "Make moderator"}</button>
        <span className="admin-faint text-xs">or</span>
        <select value={destId} onChange={(e) => setDestId(e.target.value)} className={ctl} style={formEl}>
          <option value="">Destination…</option>
          {dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button disabled={busy || !destId} onClick={() => grant("specialist")} className={`${ctl} disabled:opacity-40`} style={formEl}>Make local specialist</button>
        {msg && <span className="text-xs font-semibold" style={{ color: msg.startsWith("✓") ? "#22c55e" : "#f59e0b" }}>{msg}</span>}
      </div>
      <p className="text-[11px] admin-faint">Moderator = trusted everywhere (edits &amp; new spots go live instantly). Local specialist = trusted for one destination (edits need one confirm; their confirm clears anyone&apos;s). Locals also earn specialist standing automatically from activity.</p>
    </div>
  );
}
