"use client";

import { useEffect, useState } from "react";

type Invite = {
  id: string;
  token: string;
  invitee_name: string | null;
  invitee_email: string | null;
  status: "sent" | "opened" | "booked" | "expired" | "cancelled";
  reward_status: "pending" | "granted" | "void";
  reward_friend_amount: number | null;
  reward_inviter_amount: number | null;
  created_at: string;
  inviter?: { name: string | null; email: string | null } | null;
  invited?: { name: string | null; email: string | null } | null;
  experience?: { title: string | null; currency: string | null } | null;
  edition?: { label: string | null; date_start: string | null } | null;
};

const STATUS: Record<Invite["status"], { label: string; bg: string; fg: string }> = {
  sent: { label: "Link sent", bg: "rgba(148,163,168,0.15)", fg: "#94a3a8" },
  opened: { label: "Opened", bg: "rgba(245,158,11,0.15)", fg: "#d08700" },
  booked: { label: "Booked", bg: "rgba(34,197,94,0.15)", fg: "#16a34a" },
  expired: { label: "Expired", bg: "rgba(148,163,168,0.12)", fg: "#94a3a8" },
  cancelled: { label: "Cancelled", bg: "rgba(148,163,168,0.12)", fg: "#94a3a8" },
};

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);
  const [err, setErr] = useState("");

  function load() {
    fetch("/api/admin/invites").then((r) => r.json()).then((d) => {
      setInvites(d.invites ?? []);
      setMigrationNeeded(!!d.migrationNeeded);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function grant(id: string) {
    if (!confirm("Issue the two-sided reward? This creates a credit voucher for both the inviter and the friend.")) return;
    setGranting(id); setErr("");
    const res = await fetch(`/api/admin/invites/${id}/grant`, { method: "POST" });
    setGranting(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || "Could not grant the reward."); return; }
    load();
  }

  const fmt = (n: number | null | undefined, c = "EUR") => (n == null ? "—" : new Intl.NumberFormat("en-IE", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n));
  const counts = {
    booked: invites.filter((i) => i.status === "booked").length,
    pendingReward: invites.filter((i) => i.status === "booked" && i.reward_status === "pending").length,
    granted: invites.filter((i) => i.reward_status === "granted").length,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading">Trip invites</h1>
        <p className="text-sm admin-muted mt-0.5">Friends invited to a trip and the two-sided referral reward. Grant the reward once the friend has booked.</p>
      </div>

      {migrationNeeded && (
        <div className="mb-4 p-3 rounded-lg text-xs" style={{ border: "1px solid var(--admin-border)", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>
          Apply migration <strong>050_trip_invites</strong> in the Supabase SQL editor to start tracking invites.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-[460px]">
        {[
          { label: "Booked", value: counts.booked },
          { label: "Reward pending", value: counts.pendingReward },
          { label: "Reward granted", value: counts.granted },
        ].map((s) => (
          <div key={s.label} className="rounded-lg p-3" style={{ background: "var(--admin-surface)" }}>
            <p className="text-[11px] admin-faint">{s.label}</p>
            <p className="text-xl font-bold admin-heading mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {err && <p className="mb-3 text-xs text-red-400">{err}</p>}

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : invites.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No invites yet. Members can invite friends from their trip page.</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)", overflowX: "auto" }}>
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: "minmax(160px,1.3fr) minmax(140px,1fr) minmax(150px,1.2fr) 110px 150px", borderBottom: "1px solid var(--admin-border)" }}>
            {["Friend", "Invited by", "Trip", "Status", "Reward"].map((h) => (
              <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {invites.map((i) => {
            const s = STATUS[i.status];
            const cur = i.experience?.currency || "EUR";
            const canGrant = i.status === "booked" && i.reward_status === "pending";
            return (
              <div key={i.id} className="grid gap-3 px-5 py-3 items-center" style={{ gridTemplateColumns: "minmax(160px,1.3fr) minmax(140px,1fr) minmax(150px,1.2fr) 110px 150px", borderBottom: "1px solid var(--admin-border)" }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium admin-heading truncate">{i.invited?.name || i.invitee_name || "Shared link"}</div>
                  <div className="text-xs admin-faint truncate">{i.invited?.email || i.invitee_email || ""}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-sm admin-muted truncate">{i.inviter?.name || "—"}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-sm admin-muted truncate">{i.experience?.title || "—"}</div>
                  <div className="text-xs admin-faint truncate">{i.edition?.label || (i.edition?.date_start ? new Date(i.edition.date_start).getFullYear() : "")}</div>
                </div>
                <span className="text-[11px] font-semibold px-2 py-1 rounded justify-self-start" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                <div>
                  {i.reward_status === "granted" ? (
                    <span className="text-[11px] font-semibold px-2 py-1 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#16a34a" }}>Granted</span>
                  ) : canGrant ? (
                    <button onClick={() => grant(i.id)} disabled={granting === i.id} className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
                      {granting === i.id ? "…" : `Grant ${fmt(i.reward_inviter_amount, cur)}×2`}
                    </button>
                  ) : (
                    <span className="text-xs admin-faint">{i.reward_status === "void" ? "Void" : "—"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
