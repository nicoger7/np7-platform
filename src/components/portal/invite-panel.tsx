"use client";

import { useState } from "react";

type Invite = {
  id: string;
  token: string;
  invitee_name: string | null;
  invitee_email: string | null;
  status: "sent" | "opened" | "booked" | "expired" | "cancelled";
  reward_status: "pending" | "granted" | "void";
};

const STATUS: Record<Invite["status"], { label: string; cls: string }> = {
  sent: { label: "Invited", cls: "bg-[#eef4f6] text-[#5a6b72]" },
  opened: { label: "Opened", cls: "bg-[#fff3df] text-[#9a6b16]" },
  booked: { label: "Booked", cls: "bg-[#e1f5ee] text-[#0f6e56]" },
  expired: { label: "Expired", cls: "bg-[#eef4f6] text-[#94a3a8]" },
  cancelled: { label: "Cancelled", cls: "bg-[#eef4f6] text-[#94a3a8]" },
};

/**
 * "Invite a friend to this trip". The easy path leads: enter the friend's email
 * (+ optional note) and we send them a branded invite with a one-tap join link.
 * Secondary: copy/WhatsApp/share a reusable link. Below, the people invited and
 * whether they've opened or booked. Renders inside the booking page's <Card>.
 * Tolerant of migration 050 being unapplied (the POST returns 500 → inline error).
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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [showLink, setShowLink] = useState(false);

  const fmt = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.np-seven.com";
  const linkFor = (t: string) => `${origin}/join/${t}`;
  const generic = invites.find((i) => !i.invitee_email && !i.invitee_name) ?? null;

  async function create(payload: { inviteeName?: string; inviteeEmail?: string; note?: string; send?: boolean }) {
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
      return { invite: j.invite as Invite, emailed: !!j.emailed };
    } finally {
      setBusy(false);
    }
  }

  async function sendByEmail() {
    setErr(""); setSentTo(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr("Enter a valid email address."); return; }
    const r = await create({ inviteeEmail: email.trim(), inviteeName: name.trim() || undefined, note: note.trim() || undefined, send: true });
    if (r) {
      setSentTo(email.trim());
      if (!r.emailed) setErr("Invite created, but the email couldn't be sent right now — copy the link below to share it directly.");
      setEmail(""); setName(""); setNote("");
    }
  }

  async function copy(url: string, key: string) {
    try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(null), 1800); } catch { /* ignore */ }
  }

  const shareMsg = "Come join me on this NP7 windsurf trip 🌊 — here's the link:";
  async function ensureGenericThen(action: (url: string) => void) {
    let inv = generic;
    if (!inv) { const r = await create({}); inv = r?.invite ?? null; }
    if (inv) action(linkFor(inv.token));
  }

  const input = "w-full rounded-lg border border-[#d8e3e6] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#00afdb] transition-colors";
  const shareBtn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d8e3e6] text-[#00374a] text-[13px] font-semibold px-3 py-2 hover:bg-[#f2f8f9] transition-colors disabled:opacity-50";

  return (
    <div>
      <p className="text-[14px] text-[#5a6b72] leading-relaxed">
        Bring a friend on this trip — <span className="text-[#0f6e56] font-semibold">they get {fmt(rewardFriend)} off</span> and{" "}
        <span className="text-[#0f6e56] font-semibold">you get a {fmt(rewardInviter)} credit</span> once they book.
      </p>

      {/* Easy path: send by email */}
      <div className="mt-3 space-y-2.5">
        <input className={input} type="email" placeholder="Friend's email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} placeholder="Their name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className={`${input} min-h-[64px] resize-y`} placeholder="Add a personal note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={sendByEmail} disabled={busy} className="w-full rounded-lg bg-[#0f6e56] text-white text-[15px] font-bold py-3 disabled:opacity-50">
          {busy ? "Sending…" : "Send invite"}
        </button>
        <p className="text-[12px] text-[#94a3a8] text-center">We&apos;ll email them a branded invite with a one-tap join link.</p>
      </div>

      {sentTo && !err && (
        <div className="mt-3 rounded-lg bg-[#e1f5ee] border border-[#bfe6d7] px-3.5 py-2.5 text-[13px] text-[#0f6e56] font-semibold">
          Invite sent to {sentTo} ✉️
        </div>
      )}
      {err && <p className="mt-3 text-[13px] text-[#c0392b]">{err}</p>}

      {/* Secondary: share a link directly */}
      <button onClick={() => setShowLink((s) => !s)} className="mt-3 text-[13px] font-semibold text-[#00afdb]">
        {showLink ? "– Hide link sharing" : "Or share a link directly →"}
      </button>
      {showLink && (
        <div className="mt-2">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 rounded-lg border border-[#e3ecee] bg-[#f8fbfb] px-3 py-2 text-[13px] text-[#5a6b72] truncate flex items-center">
              {generic ? linkFor(generic.token) : `${origin}/join/…`}
            </div>
            <button className={shareBtn} disabled={busy} onClick={() => ensureGenericThen((u) => copy(u, "primary"))}>{copied === "primary" ? "Copied!" : "Copy"}</button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button className={shareBtn} disabled={busy} onClick={() => ensureGenericThen((u) => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareMsg} ${u}`)}`, "_blank"))}>WhatsApp</button>
            <button className={shareBtn} disabled={busy} onClick={() => ensureGenericThen((u) => { window.location.href = `mailto:?subject=${encodeURIComponent("Join me on this NP7 trip")}&body=${encodeURIComponent(`${shareMsg}\n\n${u}`)}`; })}>Email app</button>
            <button className={shareBtn} disabled={busy} onClick={() => ensureGenericThen((u) => { if (typeof navigator !== "undefined" && navigator.share) navigator.share({ title: "Join me on this trip", text: shareMsg, url: u }).catch(() => {}); else copy(u, "primary"); })}>Share…</button>
          </div>
        </div>
      )}

      {/* Invited list */}
      {invites.length > 0 && (
        <div className="mt-4 border-t border-[#f0e6d6] pt-3 space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#94a3a8]">Invited</p>
          {invites.map((i) => {
            const s = STATUS[i.status];
            return (
              <div key={i.id} className="flex items-center gap-2 text-[14px]">
                <span className="text-[#00374a] truncate">{i.invitee_name || i.invitee_email || "Shared link"}</span>
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
