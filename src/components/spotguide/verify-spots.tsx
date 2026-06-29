"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { COMMUNITY_VERIFY_THRESHOLD, conditionLabel } from "@/lib/spotguide";

type Pending = { id: string; name: string; level: string | null; conditions: string[]; description: string | null; isOwn: boolean; confirms: number; iConfirmed: boolean; justLive?: boolean };

/** "Help verify" — member-submitted spots awaiting community confirmation.
    Shown to logged-in members only; confirming pushes a spot to public at the
    threshold. A member can't confirm their own. */
export function VerifySpots({ destId, accent = "#00afdb" }: { destId: string; accent?: string }) {
  const sg = useSpotguide();
  const [spots, setSpots] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!sg.loggedIn) return;
    fetch(`/api/portal/spotguide/spots?dest=${destId}`).then((r) => r.json()).then((d) => setSpots(d.spots ?? [])).catch(() => {});
  }, [sg.loggedIn, destId]);

  async function confirm(id: string) {
    setBusy(id);
    const r = await fetch("/api/portal/spotguide/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spotId: id, kind: "confirm" }) });
    setBusy(null);
    if (!r.ok) return;
    const j = await r.json();
    setSpots((list) => list.map((s) => s.id === id ? { ...s, confirms: j.confirms, iConfirmed: true, justLive: j.verification === "community" } : s));
  }

  if (!sg.loggedIn || spots.length === 0) return null;

  return (
    <section>
      <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-1">Help verify</h2>
      <p className="text-[13px] text-[#6a7a80] mb-3">Members added these spots. Been to one? Confirm it&apos;s accurate — {COMMUNITY_VERIFY_THRESHOLD} confirmations make it public.</p>
      <div className="space-y-2.5">
        {spots.map((s) => (
          <div key={s.id} className="rounded-2xl border border-[#ece3d3] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-[#00374a]">{s.name}</p>
                <p className="text-[12.5px] text-[#6a7a80]">{[s.level, s.conditions.map(conditionLabel).join(" · ")].filter(Boolean).join("  ·  ")}</p>
                {s.description && <p className="text-[13.5px] text-[#5a6b72] mt-1.5 line-clamp-3">{s.description}</p>}
              </div>
              <span className="shrink-0 text-[12px] font-bold" style={{ color: accent }}>{s.confirms}/{COMMUNITY_VERIFY_THRESHOLD}</span>
            </div>
            <div className="mt-3">
              {s.justLive ? (
                <span className="text-[13px] font-bold text-[#1f9e57]">Now live for everyone — thanks! 🎉</span>
              ) : s.isOwn ? (
                <span className="text-[12.5px] text-[#9aa6ac]">Your submission · awaiting other members</span>
              ) : s.iConfirmed ? (
                <span className="text-[12.5px] font-semibold" style={{ color: accent }}>✓ You confirmed this</span>
              ) : (
                <button onClick={() => confirm(s.id)} disabled={busy === s.id} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>
                  {busy === s.id ? "…" : "I've sailed here — accurate"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
