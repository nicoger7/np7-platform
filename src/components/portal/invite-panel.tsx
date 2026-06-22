"use client";

import { useState } from "react";

type Invite = {
  id: string;
  token: string;
  invitee_name: string | null;
  status: "sent" | "opened" | "booked" | "expired" | "cancelled";
  reward_status: "pending" | "granted" | "void";
};

const STATUS: Record<Invite["status"], { label: string; cls: string }> = {
  sent: { label: "Link ready", cls: "bg-[#eef4f6] text-[#5a6b72]" },
  opened: { label: "Opened", cls: "bg-[#fff3df] text-[#9a6b16]" },
  booked: { label: "Booked", cls: "bg-[#e1f5ee] text-[#0f6e56]" },
  expired: { label: "Expired", cls: "bg-[#eef4f6] text-[#94a3a8]" },
  cancelled: { label: "Cancelled", cls: "bg-[#eef4f6] text-[#94a3a8]" },
};

/**
 * "Invite a friend to this trip" — shows the member's referral link for one
 * booking (share via copy / WhatsApp / email / native share), lets them track
 * named invitees, and surfaces who has opened or booked. Renders inside the
 * booking page's <Card>. Tolerant of migration 050 not being applied (POST 500).
 */
export function InvitePanel({
  bookingId,
  rewardFriend,
  rewardInviter,
  currency = "EUR",
  initialInvites,
}: {
  bookingId: string;
  rewardFriend: number;
  rewardInviter: number;
  currency?: string;
  initialInvites: Invite[];
}) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [showNamed, setShowNamed] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");

  const fmt = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.np-seven.com";
  const linkFor = (t: string) => `${origin}/join/${t}`;
  // The reusable "share with anyone" link is the newest un-named invite.
  const generic = invites.find((i) => !i.invitee_name) ?? null;

  async function create(payload: { inviteeName?: string; inviteeEmail?: string }) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, ...payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Could not create the invite."); return null; }
      setInvites((prev) => [j.invite, ...prev]);
      return j.invite as Invite;
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string, key: string) {
    try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(null), 1800); } catch { /* ignore */ }
  }

  const shareMsg = "Come join me on this NP7 windsurf trip 🌊 — here's the link:";
  function shareLink(url: string) {
    if (typeof navigator !== "undefined" && navigator.share) navigator.share({ title: "Join me on this trip", text: shareMsg, url }).catch(() => {});
    else copy(url, "share");
  }

  async function ensureGenericThen(action: (url: string) => void) {
    let inv = generic;
    if (!inv) inv = await create({});
    if (inv) action(linkFor(inv.token));
  }

  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d8e3e6] text-[#00374a] text-[13px] font-semibold px-3 py-2 hover:bg-[#f2f8f9] transition-colors";

  return (
    <div>
      <p className="text-[14px] text-[#5a6b72] leading-relaxed">
        Bring a friend on this trip — <span className="text-[#0f6e56] font-semibold">they get {fmt(rewardFriend)} off</span> and{" "}
        <span className="text-[#0f6e56] font-semibold">you get a {fmt(rewardInviter)} credit</span> once they book.
      </p>

      {/* Primary shareable link */}
      <div className="mt-3 flex items-stretch gap-2">
        <div className="flex-1 min-w-0 rounded-lg border border-[#e3ecee] bg-[#f8fbfb] px-3 py-2 text-[13px] text-[#5a6b72] truncate flex items-center">
          {generic ? linkFor(generic.token) : `${origin}/join/…`}
        </div>
        <button className={btn} disabled={busy} onClick={() => ensureGenericThen((u) => copy(u, "primary"))}>
          {copied === "primary" ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className={btn} disabled={busy} onClick={() => ensureGenericThen((u) => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareMsg} ${u}`)}`, "_blank"))}>WhatsApp</button>
        <button className={btn} disabled={busy} onClick={() => ensureGenericThen((u) => { window.location.href = `mailto:?subject=${encodeURIComponent("Join me on this NP7 trip")}&body=${encodeURIComponent(`${shareMsg}\n\n${u}`)}`; })}>Email</button>
        <button className={btn} disabled={busy} onClick={() => ensureGenericThen((u) => shareLink(u))}>Share</button>
      </div>

      {/* Invite a named friend (tracked separately) */}
      <button onClick={() => setShowNamed((s) => !s)} className="mt-3 text-[13px] font-semibold text-[#00afdb]">
        {showNamed ? "– Hide" : "+ Invite someone by name"}
      </button>
      {showNamed && (
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <input value={friendName} onChange={(e) => setFriendName(e.target.value)} placeholder="Friend's name" className="flex-1 rounded-lg border border-[#d8e3e6] px-3 py-2 text-[14px] outline-none focus:border-[#00afdb]" />
          <input value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} placeholder="Email (optional)" className="flex-1 rounded-lg border border-[#d8e3e6] px-3 py-2 text-[14px] outline-none focus:border-[#00afdb]" />
          <button
            disabled={busy || !friendName.trim()}
            onClick={async () => { const inv = await create({ inviteeName: friendName.trim(), inviteeEmail: friendEmail.trim() || undefined }); if (inv) { setFriendName(""); setFriendEmail(""); } }}
            className="rounded-lg bg-[#00374a] text-white text-[13px] font-semibold px-4 py-2 disabled:opacity-40"
          >Add</button>
        </div>
      )}

      {err && <p className="mt-2 text-[13px] text-[#c0392b]">{err}</p>}

      {/* Invited list */}
      {invites.length > 0 && (
        <div className="mt-4 border-t border-[#f0e6d6] pt-3 space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#94a3a8]">Invited</p>
          {invites.map((i) => {
            const s = STATUS[i.status];
            return (
              <div key={i.id} className="flex items-center gap-2 text-[14px]">
                <span className="text-[#00374a] truncate">{i.invitee_name || "Shared link"}</span>
                {i.reward_status === "granted" && <span className="text-[11px] px-2 py-0.5 rounded bg-[#e1f5ee] text-[#0f6e56] font-semibold">Reward sent</span>}
                <span className={`ml-auto text-[11px] px-2 py-0.5 rounded font-semibold ${s.cls}`}>{s.label}</span>
                <button onClick={() => copy(linkFor(i.token), i.id)} className="text-[12px] font-semibold text-[#00afdb] shrink-0">{copied === i.id ? "Copied!" : "Copy"}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
