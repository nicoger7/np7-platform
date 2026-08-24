"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  WORLDS, SECTIONS, FIELDS, builtinAccess, normalizeAccess, mergeAccess, normalizeLevel, OWNER_ONLY_SECTIONS,
  type RoleAccess, type WorldId, type SectionLevel, type FieldKey, type AccessLevel,
} from "@/lib/access";

/**
 * Team — people-first view of who's on the team and what each person can see
 * and do. Cards summarise effective access (worlds, areas, hidden data);
 * the drawer edits role assignments in place; the roles themselves are
 * defined under Team › Roles. Uses the same APIs as before — no data changes.
 */

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string | null; // free-text job title
  phone: string | null;
  rate_per_hour: number | null;
  active: boolean;
  notes: string | null;
  total_hours: number;
  total_cost: number | null;
  role_ids?: string[] | null;
  access_level?: string | null; // legacy tier — governs members WITHOUT a role
}

type RoleRow = { id: string; name: string; description?: string | null; system_key?: string | null; is_system?: boolean; access?: unknown };

/** Merged effective access for a set of role ids (built-ins computed live). */
function effectiveFor(roleIds: string[], roles: RoleRow[]): RoleAccess | null {
  const picked = roles.filter((r) => roleIds.includes(r.id));
  if (picked.length === 0) return null;
  return mergeAccess(picked.map((r) => (r.system_key ? builtinAccess(r.system_key) : normalizeAccess(r.access))));
}

const WORLD_COLOR: Record<WorldId, string> = {
  experience: "#0aa3c7",
  knowledge: "#b0791e",
  hardware: "#84cc16",
  "product-dev": "#a78bfa",
  analytics: "#34d399",
};
const WORLD_SHORT: Record<WorldId, string> = {
  experience: "Experience",
  knowledge: "Knowledge",
  hardware: "Hardware",
  "product-dev": "Product Dev",
  analytics: "Analytics",
};
const HIDDEN_LABEL: Record<FieldKey, string> = { money: "prices", costs: "costs", contact_pii: "personal data" };

function roleChipStyle(r: RoleRow): { bg: string; fg: string } {
  if (r.system_key === "owner") return { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b" };
  if (r.system_key === "manager") return { bg: "rgba(10,163,199,0.15)", fg: "#0aa3c7" };
  if (r.system_key === "photographer") return { bg: "rgba(167,139,250,0.15)", fg: "#a78bfa" };
  return { bg: "var(--admin-surface-hover)", fg: "var(--admin-text-muted)" };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

/** One-glance access summary for a member. Members without a (valid) role are
 *  governed by their legacy TIER (access_level: owner OR manager — matches
 *  admin-auth.ts), not blanket "full access". */
function summarize(roleIds: string[], roles: RoleRow[], accessLevel: string | null | undefined) {
  let eff = effectiveFor(roleIds, roles);
  let tier: AccessLevel | null = null;
  if (!eff) {
    tier = normalizeLevel(accessLevel);
    eff = builtinAccess(tier); // owner = everything; manager = no Finance/Team/Analytics
  }
  const levels = SECTIONS.map((s) => (eff!.worlds.includes(s.world) ? (eff!.sections[s.key] ?? "none") : "none"));
  const edit = levels.filter((l) => l === "edit").length;
  const view = levels.filter((l) => l === "view").length;
  // Sensitive-data claim is only made for the Experience world — the one where
  // redaction is actually enforced today (REDACTION_COVERAGE) — never as a
  // cross-world union that could overstate visibility.
  const hiddenExp = eff.worlds.includes("experience")
    ? FIELDS.map((f) => f.key).filter((k) => eff!.fields.experience?.[k] !== true)
    : [];
  const ownerOverride = roleIds.length > 1 && roles.some((r) => roleIds.includes(r.id) && r.system_key === "owner");
  return { eff, tier, worlds: eff.worlds, edit, view, hiddenExp, hasExperience: eff.worlds.includes("experience"), ownerOverride };
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [rolesState, setRolesState] = useState<"loading" | "ok" | "error">("loading");
  const [drawerId, setDrawerId] = useState<string | null>(null); // member whose access is being edited
  const [draftRoleIds, setDraftRoleIds] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessErr, setAccessErr] = useState("");
  const [inviteState, setInviteState] = useState<Record<string, "sending" | "sent" | undefined>>({});
  const [showNew, setShowNew] = useState(false);

  function load() {
    fetch("/api/admin/team").then((r) => r.json()).then((d) => { setMembers(Array.isArray(d) ? d : []); setMembersLoading(false); });
    // The access summaries depend on the roles catalog — a failed roles fetch
    // must surface as an error, never render everyone as "full access".
    setRolesState((s) => (s === "ok" ? s : "loading"));
    fetch("/api/admin/roles")
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { setRoles(d.roles ?? []); setRolesState("ok"); })
      .catch(() => setRolesState("error"));
  }
  useEffect(load, []);
  const loading = membersLoading || rolesState === "loading";

  const drawerMember = members.find((m) => m.id === drawerId) || null;

  function openDrawer(m: TeamMember) {
    setDrawerId(m.id);
    setDraftRoleIds([...(m.role_ids ?? [])]);
    setAccessErr("");
  }

  async function saveAccess() {
    if (!drawerId) return;
    setSavingAccess(true); setAccessErr("");
    try {
      const res = await fetch(`/api/admin/team/${drawerId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_ids: draftRoleIds }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setAccessErr(e.error || "Could not save."); return; }
      setMembers((ms) => ms.map((m) => (m.id === drawerId ? { ...m, role_ids: [...draftRoleIds] } : m)));
      setDrawerId(null);
    } catch {
      setAccessErr("Network error — couldn't reach the server.");
    } finally {
      setSavingAccess(false);
    }
  }

  async function sendInvite(m: TeamMember) {
    if (!m.email) return;
    setInviteState((s) => ({ ...s, [m.id]: "sending" }));
    try {
      const res = await fetch(`/api/admin/team/${m.id}/invite`, { method: "POST" });
      if (res.ok) {
        setInviteState((s) => ({ ...s, [m.id]: "sent" }));
        setTimeout(() => setInviteState((s) => ({ ...s, [m.id]: undefined })), 3000);
      } else {
        setInviteState((s) => ({ ...s, [m.id]: undefined }));
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Could not send the invite.");
      }
    } catch {
      setInviteState((s) => ({ ...s, [m.id]: undefined }));
      alert("Network error — couldn't send the invite.");
    }
  }

  async function toggleActive(m: TeamMember) {
    setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, active: !m.active } : x)));
    try {
      const res = await fetch(`/api/admin/team/${m.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !m.active }),
      });
      if (!res.ok) load(); // revert on failure
    } catch { load(); }
  }

  async function handleDuplicate(m: TeamMember) {
    try {
      await fetch(`/api/admin/team/${m.id}/duplicate`, { method: "POST" });
    } finally { load(); }
  }

  async function handleDelete(m: TeamMember) {
    if (!confirm(`Delete ${m.name}? This removes their team profile and admin access.`)) return;
    await fetch(`/api/admin/team/${m.id}`, { method: "DELETE" });
    load();
  }

  // Does anyone (besides `exceptId` with draft `ids`) still hold owner-level
  // access? Only ACTIVE members count (inactive can't log in), and role-less
  // members count only if their legacy tier is actually "owner".
  const ownerRoleId = roles.find((r) => r.system_key === "owner")?.id;
  function memberIsOwner(m: TeamMember): boolean {
    if (!m.active) return false;
    const ids = m.role_ids ?? [];
    if (ownerRoleId && ids.includes(ownerRoleId)) return true;
    // No valid role → tier fallback governs (deleted-role ids resolve here too).
    return effectiveFor(ids, roles) === null && normalizeLevel(m.access_level) === "owner";
  }
  function otherOwnerExists(exceptId: string, ids: string[]): boolean {
    if (ownerRoleId && ids.includes(ownerRoleId)) return true;
    return members.some((m) => m.id !== exceptId && memberIsOwner(m));
  }

  const sorted = useMemo(
    () => [...members].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [members]
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Team</h1>
          <p className="text-sm admin-muted">
            {members.length} member{members.length !== 1 ? "s" : ""} — each card shows exactly what that person can see and do.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/roles" className="px-3.5 py-2 text-xs font-bold rounded-lg transition-colors admin-muted hover:text-[var(--admin-accent)]" style={{ border: "1px solid var(--admin-border)" }}>
            Manage roles
          </Link>
          <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            New member
          </button>
        </div>
      </div>

      {rolesState === "error" && !loading && (
        <div className="mb-4 p-3 rounded-lg text-xs flex items-center justify-between gap-3" style={{ border: "1px solid rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
          <span>Couldn&apos;t load the roles catalog — access summaries can&apos;t be shown reliably right now.</span>
          <button onClick={load} className="px-2.5 py-1 rounded-lg font-bold shrink-0" style={{ border: "1px solid rgba(239,68,68,0.45)" }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : members.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No team members yet — add the first one.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((m) => {
            const s = summarize(m.role_ids ?? [], roles, m.access_level);
            const memberRoles = roles.filter((r) => (m.role_ids ?? []).includes(r.id));
            const inv = inviteState[m.id];
            const rolesOk = rolesState === "ok";
            return (
              <div key={m.id} className={`rounded-xl p-4 flex flex-col gap-3 transition-opacity ${m.active ? "" : "opacity-55"}`} style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                {/* Who */}
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full grid place-items-center text-sm font-black shrink-0" style={{ background: "color-mix(in srgb, var(--admin-accent) 14%, transparent)", color: "var(--admin-accent)" }}>
                    {initials(m.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/team/${m.id}`} className="text-sm font-bold admin-heading truncate hover:text-[#0aa3c7] transition-colors">{m.name}</Link>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${m.active ? "bg-green-400" : "bg-gray-400"}`} title={m.active ? "Active" : "Inactive"} />
                    </div>
                    <p className="text-xs admin-muted truncate">{m.role || "Team member"}{m.email ? ` · ${m.email}` : ""}</p>
                  </div>
                </div>

                {/* Access roles */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {!rolesOk ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>Access info unavailable</span>
                  ) : memberRoles.length === 0 ? (
                    s.tier === "manager" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: "rgba(10,163,199,0.13)", color: "#0aa3c7" }}>No role → Manager tier</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>No role → Owner (everything)</span>
                    )
                  ) : (
                    memberRoles.map((r) => {
                      const c = roleChipStyle(r);
                      return <span key={r.id} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: c.bg, color: c.fg }}>{r.name}</span>;
                    })
                  )}
                  {rolesOk && s.ownerOverride && <span className="text-[10px] font-semibold" style={{ color: "#f59e0b" }} title="Owner grants everything — the other roles change nothing.">⚠ Owner overrides</span>}
                </div>

                {/* What they can reach */}
                {rolesOk && (
                <div className="rounded-lg px-3 py-2.5 space-y-1.5" style={{ background: "var(--admin-surface-hover)" }}>
                  <div className="flex flex-wrap gap-1.5">
                    {WORLDS.map((w) => {
                      const on = s.worlds.includes(w.id);
                      return (
                        <span key={w.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={on ? { background: `color-mix(in srgb, ${WORLD_COLOR[w.id]} 16%, transparent)`, color: WORLD_COLOR[w.id] } : { color: "var(--admin-text-faint)", opacity: 0.45 }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? WORLD_COLOR[w.id] : "currentColor" }} />
                          {WORLD_SHORT[w.id]}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[11px] admin-muted">
                    {s.tier === "owner" ? (
                      <>Everything — all areas, all data <span className="admin-faint">(Owner fallback)</span></>
                    ) : (
                      <>
                        {s.edit > 0 && <><strong className="admin-heading">{s.edit}</strong> area{s.edit !== 1 ? "s" : ""} edit</>}
                        {s.view > 0 && <>{s.edit > 0 ? " · " : ""}<strong className="admin-heading">{s.view}</strong> view-only</>}
                        {s.edit === 0 && s.view === 0 && <>No areas granted</>}
                        {s.tier === "manager" && <span className="admin-faint"> (legacy Manager tier)</span>}
                        {s.hasExperience && (s.hiddenExp.length > 0
                          ? <span style={{ color: "#f59e0b" }}> · hides {s.hiddenExp.map((h) => HIDDEN_LABEL[h]).join(", ")}</span>
                          : (s.edit > 0 || s.view > 0) && <span className="admin-faint"> · sees all sensitive data</span>)}
                      </>
                    )}
                  </p>
                </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <button onClick={() => openDrawer(m)} className="flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors text-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/10" style={{ border: "1px solid var(--admin-accent)" }}>
                    Edit access
                  </button>
                  <button onClick={() => sendInvite(m)} disabled={!m.email || inv === "sending"} title={m.email ? `Email a login link to ${m.email}` : "Add an email on the profile first"} className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors admin-muted hover:text-[var(--admin-accent)] disabled:opacity-35" style={{ border: "1px solid var(--admin-border)" }}>
                    {inv === "sending" ? "Sending…" : inv === "sent" ? "Sent ✓" : "Invite"}
                  </button>
                  <CardMenu member={m} onToggleActive={() => toggleActive(m)} onDuplicate={() => handleDuplicate(m)} onDelete={() => handleDelete(m)} />
                </div>

                {(m.total_hours > 0 || m.rate_per_hour != null) && (
                  <p className="text-[10px] admin-faint -mt-1">
                    {m.total_hours > 0 ? `${m.total_hours}h logged` : ""}
                    {m.total_cost != null && m.total_cost > 0 ? ` · €${m.total_cost.toLocaleString()}` : ""}
                    {m.rate_per_hour != null ? ` · €${m.rate_per_hour}/h` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Access drawer */}
      {drawerMember && (
        <AccessDrawer
          member={drawerMember}
          roles={roles}
          draftRoleIds={draftRoleIds}
          setDraftRoleIds={setDraftRoleIds}
          saving={savingAccess}
          error={accessErr}
          noOwnerLeft={!otherOwnerExists(drawerMember.id, draftRoleIds)}
          onSave={saveAccess}
          onClose={() => setDrawerId(null)}
        />
      )}

      {/* New member */}
      {showNew && (
        <NewMemberPanel roles={roles} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      )}
    </div>
  );
}

/* ─── Card ⋯ menu (click-toggled so it works on touch) ───────────────────── */

function CardMenu({ member, onToggleActive, onDuplicate, onDelete }: { member: TeamMember; onToggleActive: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    // No stopPropagation on the trigger, so opening one menu lets this
    // document listener close any other open menu at the same time.
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="px-2 py-1.5 text-xs rounded-lg admin-faint hover:admin-muted transition-colors" style={{ border: "1px solid var(--admin-border)" }} aria-label="More actions" aria-expanded={open}>⋯</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 rounded-lg overflow-hidden min-w-[150px]" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
          <Link href={`/admin/team/${member.id}`} className="block px-3 py-2 text-xs admin-muted hover:bg-[var(--admin-surface-hover)]">Open profile</Link>
          <button onClick={onToggleActive} className="block w-full text-left px-3 py-2 text-xs admin-muted hover:bg-[var(--admin-surface-hover)]">{member.active ? "Deactivate" : "Reactivate"}</button>
          <button onClick={onDuplicate} className="block w-full text-left px-3 py-2 text-xs admin-muted hover:bg-[var(--admin-surface-hover)]">Duplicate</button>
          <button onClick={onDelete} className="block w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10">Delete…</button>
        </div>
      )}
    </div>
  );
}

/* ─── Access drawer ──────────────────────────────────────────────────────── */

function AccessDrawer({ member, roles, draftRoleIds, setDraftRoleIds, saving, error, noOwnerLeft, onSave, onClose }: {
  member: TeamMember;
  roles: RoleRow[];
  draftRoleIds: string[];
  setDraftRoleIds: (ids: string[]) => void;
  saving: boolean;
  error: string;
  noOwnerLeft: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const first = member.name.split(/\s+/)[0] || member.name;

  function toggleRole(id: string) {
    setDraftRoleIds(draftRoleIds.includes(id) ? draftRoleIds.filter((x) => x !== id) : [...draftRoleIds, id]);
  }

  function roleSummary(r: RoleRow): string {
    const a = r.system_key ? builtinAccess(r.system_key) : normalizeAccess(r.access);
    const secs = SECTIONS.filter((s) => a.worlds.includes(s.world) && (a.sections[s.key] ?? "none") !== "none").length;
    return `${a.worlds.length} world${a.worlds.length !== 1 ? "s" : ""} · ${secs} area${secs !== 1 ? "s" : ""}`;
  }

  const eff = effectiveFor(draftRoleIds, roles);
  const ownerPicked = roles.some((r) => draftRoleIds.includes(r.id) && r.system_key === "owner");

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label={`Access for ${member.name}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full overflow-y-auto p-5 flex flex-col gap-4" style={{ background: "var(--admin-bg, var(--admin-surface))", borderLeft: "1px solid var(--admin-border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold admin-heading">{member.name}</h2>
            <p className="text-xs admin-muted mt-0.5">What can {first} see and do?</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center admin-faint hover:admin-muted transition-colors" style={{ border: "1px solid var(--admin-border)" }}>✕</button>
        </div>

        {/* Role picker */}
        <div className="space-y-2">
          {roles.map((r) => {
            const on = draftRoleIds.includes(r.id);
            const c = roleChipStyle(r);
            return (
              <label key={r.id} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors" style={{ border: on ? `1.5px solid ${c.fg}` : "1px solid var(--admin-border)", background: on ? c.bg : "var(--admin-surface)" }}>
                <input type="checkbox" checked={on} onChange={() => toggleRole(r.id)} className="w-4 h-4 mt-0.5 accent-[#0aa3c7] shrink-0" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold admin-heading">{r.name}</span>
                    {r.is_system && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase admin-surface admin-faint">Built-in</span>}
                  </span>
                  <span className="block text-[11px] admin-muted mt-0.5">{r.description || roleSummary(r)}</span>
                </span>
              </label>
            );
          })}
          {roles.length === 0 && <p className="text-xs admin-faint">No roles available yet — define them under <Link href="/admin/roles" className="underline">Team › Roles</Link>.</p>}
        </div>

        {/* Warnings */}
        {ownerPicked && draftRoleIds.length > 1 && (
          <p className="text-[11px] px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>
            ⚠ <strong>Owner</strong> grants everything — the other selected roles change nothing. Remove Owner to actually limit {first}.
          </p>
        )}
        {draftRoleIds.length === 0 && (normalizeLevel(member.access_level) === "owner" ? (
          <p className="text-[11px] px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>
            ⚠ No role selected — {first} falls back to <strong>full Owner access</strong>. Pick at least one role to limit them.
          </p>
        ) : (
          <p className="text-[11px] px-3 py-2 rounded-lg admin-muted" style={{ border: "1px solid var(--admin-border)" }}>
            No role selected — {first} falls back to the legacy <strong>Manager</strong> tier (everything except Finance, Company settings, Team admin and Analytics).
          </p>
        ))}
        {noOwnerLeft && roles.length > 0 && (
          <p className="text-[11px] px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
            ⚠ After this change nobody on the team holds <strong>Owner</strong> — make sure you keep owner access for yourself.
          </p>
        )}

        {/* Live preview */}
        <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] admin-faint">Resulting access</p>
          {!eff ? (
            <p className="text-xs admin-muted">Everything — all worlds, all areas, all sensitive data.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {WORLDS.map((w) => {
                  const on = eff.worlds.includes(w.id);
                  return (
                    <span key={w.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold" style={on ? { background: `color-mix(in srgb, ${WORLD_COLOR[w.id]} 16%, transparent)`, color: WORLD_COLOR[w.id] } : { color: "var(--admin-text-faint)", opacity: 0.4, border: "1px dashed var(--admin-border)" }}>
                      {WORLD_SHORT[w.id]}
                    </span>
                  );
                })}
              </div>
              {/* Sensitive data, stated PER WORLD — a union claim could overstate
                  what a multi-world role sees where redaction actually runs. */}
              {WORLDS.filter((w) => eff.worlds.includes(w.id)).map((w) => {
                const hiddenW = FIELDS.map((f) => f.key).filter((k) => eff.fields[w.id]?.[k] !== true);
                return (
                  <p key={w.id} className="text-[11px]" style={hiddenW.length ? { color: "#f59e0b" } : undefined}>
                    <span className={hiddenW.length ? "" : "admin-faint"}>
                      {WORLD_SHORT[w.id]}: {hiddenW.length ? `hides ${hiddenW.map((h) => HIDDEN_LABEL[h]).join(", ")}` : "all sensitive data visible"}
                    </span>
                  </p>
                );
              })}
              {/* Per-world area detail */}
              {WORLDS.filter((w) => eff.worlds.includes(w.id)).map((w) => {
                const granted = SECTIONS.filter((s) => s.world === w.id && (eff.sections[s.key] ?? "none") !== "none");
                if (!granted.length) return <p key={w.id} className="text-[11px] admin-faint">{WORLD_SHORT[w.id]}: no areas granted.</p>;
                return (
                  <details key={w.id} className="text-[11px]">
                    <summary className="cursor-pointer admin-muted font-semibold select-none">
                      {WORLD_SHORT[w.id]} — {granted.length} area{granted.length !== 1 ? "s" : ""}
                    </summary>
                    <ul className="mt-1.5 ml-1 space-y-1">
                      {granted.map((s) => {
                        const lvl = eff.sections[s.key] as SectionLevel;
                        return (
                          <li key={s.key} className="flex items-center justify-between gap-2">
                            <span className="admin-muted">{s.label}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={lvl === "edit" ? { background: "color-mix(in srgb, var(--admin-accent) 16%, transparent)", color: "var(--admin-accent)" } : { background: "var(--admin-surface-hover)", color: "var(--admin-text-muted)" }}>
                              {lvl}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </>
          )}
        </div>

        <p className="text-[11px] admin-faint">Roles combine — access is the union of everything selected. Adjust what a role itself grants under <Link href="/admin/roles" className="underline hover:text-[var(--admin-accent)]">Team › Roles</Link>.</p>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 mt-auto pt-2">
          <button onClick={onSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            {saving ? "Saving…" : "Save access"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 admin-muted text-sm rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ─── New member ─────────────────────────────────────────────────────────── */

function NewMemberPanel({ roles, onClose, onCreated }: { roles: RoleRow[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "", phone: "", rate_per_hour: "", notes: "" });
  const [roleIds, setRoleIds] = useState<string[]>(() => {
    const mgr = roles.find((r) => r.system_key === "manager");
    return mgr ? [mgr.id] : [];
  });
  const [sendInvite, setSendInvite] = useState(true);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const eff = effectiveFor(roleIds, roles);
  // Sensitive-data claim only for the Experience world (where redaction is enforced).
  const hidden = eff?.worlds.includes("experience")
    ? FIELDS.map((f) => f.key).filter((k) => eff.fields.experience?.[k] !== true)
    : [];

  async function create() {
    if (!form.name.trim()) { setErr("Give them a name."); return; }
    setCreating(true); setErr("");
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          email: form.email.trim() || null,
          role: form.role.trim() || null,
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
          rate_per_hour: form.rate_per_hour ? Number(form.rate_per_hour) : null,
          role_ids: roleIds,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error || `Couldn't create member (${res.status}).`);
        return;
      }
      const created = await res.json();
      if (sendInvite && form.email.trim() && created?.id) {
        // Best-effort — the member exists either way; invite can be re-sent from the card.
        await fetch(`/api/admin/team/${created.id}/invite`, { method: "POST" }).catch(() => {});
      }
      onCreated();
    } catch {
      setErr("Network error — couldn't reach the server.");
    } finally {
      setCreating(false);
    }
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div className="fixed inset-0 z-[90] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="New team member">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[640px] rounded-2xl p-5 sm:p-6 my-6" style={{ background: "var(--admin-bg, var(--admin-surface))", border: "1px solid var(--admin-border)" }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold admin-heading">New team member</h2>
            <p className="text-xs admin-muted mt-0.5">Who they are, then what they can see and do.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center admin-faint hover:admin-muted transition-colors" style={{ border: "1px solid var(--admin-border)" }}>✕</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
          <div><label className={labelClass}>Email <span className="admin-faint font-normal">(for their login invite)</span></label><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className={labelClass}>Job title</label><input className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Coach, Photographer" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className={labelClass}>Rate €/h</label><input className={inputClass} type="number" step="0.01" value={form.rate_per_hour} onChange={(e) => setForm({ ...form, rate_per_hour: e.target.value })} /></div>
          </div>
          <div className="sm:col-span-2"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything the team should know" /></div>
        </div>

        <p className="text-xs font-bold admin-heading mb-2">Access</p>
        {roles.length === 0 ? (
          <p className="text-[11px] admin-faint mb-3">Roles load from <strong>Team › Roles</strong> — without one, new members get full Owner access.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            {roles.map((r) => {
              const on = roleIds.includes(r.id);
              const c = roleChipStyle(r);
              return (
                <label key={r.id} className="flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors" style={{ border: on ? `1.5px solid ${c.fg}` : "1px solid var(--admin-border)", background: on ? c.bg : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => setRoleIds((ids) => (on ? ids.filter((x) => x !== r.id) : [...ids, r.id]))} className="w-4 h-4 mt-0.5 accent-[#0aa3c7] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold admin-heading">{r.name}</span>
                    <span className="block text-[10px] admin-muted mt-0.5 line-clamp-2">{r.description || ""}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {/* Live consequence line */}
        <p className="text-[11px] admin-muted mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--admin-surface-hover)" }}>
          {!eff
            ? <>⚠ <strong style={{ color: "#f59e0b" }}>Full access</strong> — no role selected means the Owner fallback (everything, incl. finance).</>
            : <>
                Can enter <strong className="admin-heading">{eff.worlds.map((w) => WORLD_SHORT[w]).join(", ") || "no worlds"}</strong>
                {eff.worlds.includes("experience") && (hidden.length > 0
                  ? <span style={{ color: "#f59e0b" }}> · hides {hidden.map((h) => HIDDEN_LABEL[h]).join(", ")} in Experience</span>
                  : " · sees all sensitive data in Experience")}
              </>}
        </p>

        <label className={`flex items-center gap-2.5 mb-4 ${form.email.trim() ? "cursor-pointer" : "opacity-40"}`}>
          <input type="checkbox" checked={sendInvite && !!form.email.trim()} disabled={!form.email.trim()} onChange={(e) => setSendInvite(e.target.checked)} className="w-4 h-4 accent-[#0aa3c7]" />
          <span className="text-xs admin-muted">Send the login invite right away{form.email.trim() ? ` (to ${form.email.trim()})` : " — add an email first"}</span>
        </label>

        {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
        <div className="flex gap-2">
          <button onClick={create} disabled={!form.name.trim() || creating} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            {creating ? "Creating…" : "Create member"}
          </button>
          <button onClick={onClose} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}
