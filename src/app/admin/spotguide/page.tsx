"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { VERIFICATION_META, conditionLabel, type Verification } from "@/lib/spotguide";
import { SpotIntake } from "@/components/admin/spot-intake";

interface PendingSpot {
  id: string; name: string; destination_id: string; destinationName: string;
  level: string | null; conditions: string[] | null; description: string | null;
  verification: string; confirms: number; flags: number; flagReasons?: string[];
  ageDays: number; stuck: boolean; flagged: boolean;
}
interface PendingPhoto { id: string; spot_id: string; url: string; caption: string | null }
interface PendingEdit { id: string; spotId: string; spotName: string; proposer: string; field: string; fieldLabel: string; from: string; to: string; note: string | null; status: string }
interface Grant { id: string; contactName: string; contactEmail: string | null; role: string; destinationName: string | null }
interface Member { id: string; name: string; email: string | null }

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export default function SpotguideModeration() {
  const [spots, setSpots] = useState<PendingSpot[]>([]);
  const [hiddenSpots, setHiddenSpots] = useState<PendingSpot[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [proposedDests, setProposedDests] = useState<{ id: string; name: string; region: string | null }[]>([]);
  const [edits, setEdits] = useState<PendingEdit[]>([]);
  const [trust, setTrust] = useState<Grant[]>([]);
  const [jibe, setJibe] = useState<{ toStructure: number; toMerge: number; toIntake?: number; lastRun?: { ran_at: string; structured: number; merged: number; summary: string | null } | null } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [dests, setDests] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Member | null>(null);
  const [specDest, setSpecDest] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reloadTrust = useCallback(() => {
    fetch("/api/admin/spotguide/trust").then((r) => r.json()).then((d) => setTrust(d.grants ?? [])).catch(() => {});
  }, []);
  const load = useCallback(() => {
    fetch("/api/admin/spotguide/pending").then((r) => r.json()).then((d) => { setSpots(d.spots ?? []); setHiddenSpots(d.hiddenSpots ?? []); setPhotos(d.photos ?? []); setProposedDests(d.proposedDests ?? []); setEdits(d.edits ?? []); setJibe(d.jibe ?? null); setLoading(false); });
    reloadTrust();
  }, [reloadTrust]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/members").then((r) => r.json()).then((d) => { const arr = Array.isArray(d) ? d : (d.members ?? []); setMembers(arr.map((m: { id: string; name: string; email: string | null }) => ({ id: m.id, name: m.name, email: m.email ?? null }))); }).catch(() => {});
    fetch("/api/admin/destinations").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setDests(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))); }).catch(() => {});
  }, []);

  async function moderateEdit(id: string, action: "approve" | "reject" | "merged") {
    setBusy(id);
    const j = await fetch(`/api/admin/spotguide/edits/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => r.json()).catch(() => ({}));
    setBusy(null);
    // Accepting an info suggestion keeps it in the list (now awaiting merge); everything else clears.
    if (action === "approve" && j.status === "approved") setEdits((list) => list.map((e) => e.id === id ? { ...e, status: "approved" } : e));
    else setEdits((list) => list.filter((e) => e.id !== id));
  }

  async function revokeTrust(id: string) {
    setBusy(id);
    await fetch(`/api/admin/spotguide/trust?id=${id}`, { method: "DELETE" });
    setBusy(null);
    setTrust((list) => list.filter((g) => g.id !== id));
  }

  async function grantTrust(role: "moderator" | "specialist") {
    if (!picked || (role === "specialist" && !specDest)) return;
    setBusy("appoint");
    await fetch("/api/admin/spotguide/trust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: picked.id, role, destinationId: role === "specialist" ? specDest : undefined }) });
    setBusy(null);
    setPicked(null); setQ(""); setSpecDest("");
    reloadTrust();
  }

  async function publishDest(id: string) {
    setBusy(id);
    await fetch(`/api/admin/destinations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spotguide_status: "published" }) });
    setBusy(null);
    setProposedDests((list) => list.filter((d) => d.id !== id));
  }

  async function moderatePhoto(id: string, status: "approved" | "rejected") {
    setBusy(id);
    await fetch(`/api/admin/spotguide/photos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setBusy(null);
    setPhotos((list) => list.filter((p) => p.id !== id));
  }

  /** Hiding a spot takes it out of the queue; this hands it back to the riders. */
  async function restore(id: string) {
    await fetch("/api/admin/spotguide/pending", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "published" }),
    }).catch(() => {});
    setHiddenSpots((list) => list.filter((s) => s.id !== id));
  }

  async function act(id: string, patch: Record<string, string>) {
    setBusy(id);
    await fetch(`/api/admin/spots/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(null);
    setSpots((list) => list.filter((s) => s.id !== id));
  }

  return (
    <div className="max-w-[860px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">Spotguide — contributions</h1>
        <p className="text-sm admin-muted">Most of this runs itself: a spot goes public once 3 riders confirm it (or a local, or you), and its <span className="font-semibold">rider-proposed place auto-publishes with it</span>. The ones sorted to the top — <span className="text-red-400 font-semibold">🚩 Flagged</span> or <span className="text-amber-500 font-semibold">Needs you</span> (waiting too long) — are the ones worth your glance. You can NP7-verify (gold) any spot any time.</p>
      </div>

      <SpotIntake />

      {jibe && (
        <div className="mb-8 rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold admin-heading">jibe</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#0aa3c7]/15 text-[#0aa3c7]">automated</span>
          </div>
          <p className="text-xs admin-faint mb-3">jibe structures new member spots and folds community-confirmed tips into descriptions on its own schedule — this is just a window in, nothing to action.</p>
          {jibe.lastRun ? (
            <p className="text-xs mb-3">
              <span className="text-green-500 font-semibold">Last ran {timeAgo(jibe.lastRun.ran_at)}</span>
              <span className="admin-muted"> — {jibe.lastRun.summary || `structured ${jibe.lastRun.structured}, folded ${jibe.lastRun.merged}`}</span>
            </p>
          ) : (
            <p className="text-xs mb-3 text-amber-500">No heartbeat yet — jibe hasn&apos;t checked in. Make sure the spotguide brief is scheduled on jibe (it logs every run here, even &ldquo;nothing to do&rdquo;).</p>
          )}
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="text-2xl font-bold admin-heading tabular-nums">{jibe.toStructure}</div>
              <div className="text-[11px] admin-faint">spots to structure</div>
            </div>
            <div className="flex-1 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="text-2xl font-bold admin-heading tabular-nums">{jibe.toMerge}</div>
              <div className="text-[11px] admin-faint">tips to fold in</div>
            </div>
            <div className="flex-1 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="text-2xl font-bold admin-heading tabular-nums">{jibe.toIntake ?? 0}</div>
              <div className="text-[11px] admin-faint">intake texts to structure</div>
            </div>
          </div>
        </div>
      )}

      {!loading && proposedDests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold admin-heading mb-2">Proposed areas <span className="admin-faint font-normal">({proposedDests.length})</span></h2>
          <p className="text-xs admin-faint mb-2">New destinations a member named while adding a spot. Publish to make the area live in the guide, or open it to edit first.</p>
          <div className="space-y-2">
            {proposedDests.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="min-w-0">
                  <Link href={`/admin/destinations/${d.id}`} className="text-sm font-bold admin-heading hover:text-[#0aa3c7]">{d.name}</Link>
                  {d.region && <span className="text-[11px] admin-faint ml-2">{d.region}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => publishDest(d.id)} disabled={busy === d.id} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">Publish area</button>
                  <Link href={`/admin/destinations/${d.id}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold admin-muted" style={{ border: "1px solid var(--admin-border)" }}>Open</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && edits.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold admin-heading mb-2">Pending corrections <span className="admin-faint font-normal">({edits.length})</span></h2>
          <p className="text-xs admin-faint mb-2">Name/pin fixes apply on approve. Info suggestions are collected (members confirm them too) and, once accepted, wait to be folded into the description — AI will do this later; for now open the spot and edit it, then mark merged.</p>
          <div className="space-y-2">
            {edits.map((e) => {
              const isInfo = e.field === "info";
              const awaitingMerge = isInfo && e.status === "approved";
              return (
              <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl p-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold admin-heading">
                    <Link href={`/admin/spots/${e.spotId}`} className="hover:text-[#0aa3c7]">{e.spotName}</Link> <span className="admin-faint font-normal">· {e.fieldLabel}</span>
                    {awaitingMerge && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/15 text-green-500">accepted · awaiting merge</span>}
                  </p>
                  {isInfo ? (
                    <p className="text-xs admin-muted mt-1">“{e.to}”</p>
                  ) : (
                    <p className="text-xs admin-muted mt-1"><span className="line-through admin-faint">{e.from}</span> <span className="admin-faint">→</span> <b className="admin-heading">{e.to}</b></p>
                  )}
                  {e.note && <p className="text-[11px] admin-faint italic mt-0.5">“{e.note}”</p>}
                  <p className="text-[11px] admin-faint mt-1">by {e.proposer}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {awaitingMerge ? (
                    <button onClick={() => moderateEdit(e.id, "merged")} disabled={busy === e.id} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">Mark merged</button>
                  ) : (
                    <button onClick={() => moderateEdit(e.id, "approve")} disabled={busy === e.id} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">{isInfo ? "Accept" : "Approve"}</button>
                  )}
                  <button onClick={() => moderateEdit(e.id, "reject")} disabled={busy === e.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400/70 hover:text-red-400 disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }}>Reject</button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && photos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold admin-heading mb-2">Pending photos <span className="admin-faint font-normal">({photos.length})</span></h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                <Link href={`/admin/spots/${p.spot_id}`} className="block aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: `url('${p.url}')` }} />
                <div className="flex">
                  <button onClick={() => moderatePhoto(p.id, "approved")} disabled={busy === p.id} className="flex-1 py-1.5 text-xs font-bold text-green-500 hover:bg-green-500/10 disabled:opacity-50">Approve</button>
                  <button onClick={() => moderatePhoto(p.id, "rejected")} disabled={busy === p.id} className="flex-1 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50 border-l" style={{ borderColor: "var(--admin-border)" }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : spots.length === 0 ? (
        photos.length === 0 && proposedDests.length === 0 && edits.length === 0 ? <div className="py-16 text-center"><p className="text-sm admin-faint">Nothing awaiting review</p><p className="text-xs admin-faint mt-1">Member-submitted spots, corrections, photos &amp; areas will appear here.</p></div> : null
      ) : (
        <div className="space-y-3">
          {spots.map((s) => {
            const vm = VERIFICATION_META[(s.verification as Verification)] ?? VERIFICATION_META.pending;
            return (
              <div key={s.id} className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/spots/${s.id}?from=spotguide`} className="text-sm font-bold admin-heading hover:text-[#0aa3c7]">{s.name}</Link>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: `${vm.color}1f`, color: vm.color }}>{vm.short}</span>
                      {s.flagged ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-400">🚩 Flagged</span>
                      ) : s.stuck ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-500">Needs you</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] admin-faint mt-0.5">{s.destinationName}{s.level ? ` · ${s.level}` : ""}{s.conditions?.length ? ` · ${s.conditions.map(conditionLabel).join(", ")}` : ""}</p>
                    {s.description && <p className="text-xs admin-muted mt-1.5 line-clamp-3">{s.description}</p>}
                    <p className="text-[11px] admin-faint mt-1.5">{s.confirms} member confirm{s.confirms === 1 ? "" : "s"}{s.flags ? ` · ${s.flags} flag${s.flags === 1 ? "" : "s"}` : ""}</p>
                    {s.flagged && (
                      <div className="mt-1.5 rounded-lg px-2.5 py-2 bg-red-500/10" style={{ border: "1px solid rgba(248,113,113,0.25)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-red-400 mb-0.5">Why it was flagged</p>
                        {s.flagReasons && s.flagReasons.length > 0 ? (
                          <ul className="space-y-0.5">
                            {s.flagReasons.map((r, i) => <li key={i} className="text-[11.5px] admin-muted">“{r}”</li>)}
                          </ul>
                        ) : (
                          <p className="text-[11px] admin-faint">{s.flags} rider{s.flags === 1 ? "" : "s"} marked it off but left no reason — open the editor to check the pin &amp; details.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => act(s.id, { verification: "np7" })} disabled={busy === s.id} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">NP7 verify</button>
                  <button onClick={() => act(s.id, { verification: "community" })} disabled={busy === s.id} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }}>Approve (community)</button>
                  <button onClick={() => act(s.id, { status: "hidden" })} disabled={busy === s.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400/70 hover:text-red-400 disabled:opacity-50">Hide</button>
                  <Link href={`/admin/spots/${s.id}?from=spotguide`} className="px-3 py-1.5 rounded-lg text-xs font-semibold admin-muted ml-auto" style={{ border: "1px solid var(--admin-border)" }}>Open editor</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && (
        <div className="mt-10 pt-6" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <h2 className="text-sm font-bold admin-heading mb-1">Trusted contributors <span className="admin-faint font-normal">({trust.length})</span></h2>
          <p className="text-xs admin-faint mb-3">Moderators&apos; edits &amp; new spots go live instantly; a local specialist&apos;s need just one confirm, and their confirm alone clears anyone&apos;s. Appoint someone below (or from their member page). Locals also <em>earn</em> specialist standing automatically from activity.</p>

          <div className="mb-3 rounded-lg p-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            {!picked ? (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Appoint a member — search name or email…" className="w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]" />
                {q.trim().length >= 2 && (() => {
                  const matches = members.filter((m) => `${m.name} ${m.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6);
                  return (
                    <div className="mt-1.5 space-y-1">
                      {matches.map((m) => (
                        <button key={m.id} onClick={() => { setPicked(m); setQ(""); }} className="block w-full text-left px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--admin-border)" }}>
                          <span className="font-semibold admin-heading">{m.name}</span>{m.email && <span className="admin-faint text-xs"> · {m.email}</span>}
                        </button>
                      ))}
                      {matches.length === 0 && <p className="text-xs admin-faint px-1">No match.</p>}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold admin-heading">{picked.name}</span>
                <button onClick={() => grantTrust("moderator")} disabled={busy === "appoint"} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0aa3c7]/15 text-[#0aa3c7] disabled:opacity-50">Make moderator</button>
                <span className="admin-faint text-xs">or</span>
                <select value={specDest} onChange={(e) => setSpecDest(e.target.value)} className="px-2 py-1.5 admin-input border rounded-lg text-xs">
                  <option value="">specialist at…</option>
                  {dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => grantTrust("specialist")} disabled={busy === "appoint" || !specDest} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/15 text-green-500 disabled:opacity-50">Make specialist</button>
                <button onClick={() => { setPicked(null); setSpecDest(""); }} className="text-xs admin-faint hover:underline ml-auto">cancel</button>
              </div>
            )}
          </div>

          {trust.length === 0 ? (
            <p className="text-xs admin-faint">No appointments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {trust.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${g.role === "moderator" ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "bg-green-500/15 text-green-500"}`}>{g.role === "moderator" ? "Moderator" : "Specialist"}</span>
                    <span className="text-sm font-semibold admin-heading truncate">{g.contactName}</span>
                    {g.destinationName && <span className="text-[11px] admin-faint">· {g.destinationName}</span>}
                  </div>
                  <button onClick={() => revokeTrust(g.id)} disabled={busy === g.id} className="px-2.5 py-1 rounded text-[11px] font-semibold text-red-400/70 hover:text-red-400 disabled:opacity-50 shrink-0">Revoke</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hiddenSpots.length > 0 && (
        <div className="mt-8">
          <button type="button" onClick={() => setShowHidden((v) => !v)}
            className="text-xs font-bold admin-muted hover:admin-heading transition-colors">
            {showHidden ? "▾" : "▸"} Hidden contributions ({hiddenSpots.length})
          </button>
          {showHidden && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] admin-faint mb-1">Hidden spots leave the queue — restore one to hand it back to the riders for confirmation.</p>
              {hiddenSpots.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
                  <span className="text-xs font-bold admin-heading truncate flex-1">{s.name}<span className="admin-faint font-normal"> · {s.destinationName}</span></span>
                  <button onClick={() => restore(s.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#0aa3c7] hover:underline">Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
