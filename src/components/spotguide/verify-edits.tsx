"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";

type PendingEdit = {
  id: string; spotName: string; field: string; fieldLabel: string;
  from: string; to: string; note: string | null;
  isOwn: boolean; confirms: number; required: number; iConfirmed: boolean; justLive?: boolean;
};

/** "Help review corrections" — member-suggested edits awaiting confirmation.
    Confirming pushes the change onto the spot at the threshold (or instantly if
    you're a trusted local/moderator). Shown to logged-in members only. */
export function VerifyEdits({ destId, accent = "#00afdb" }: { destId: string; accent?: string }) {
  const sg = useSpotguide();
  const [edits, setEdits] = useState<PendingEdit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!sg.loggedIn) return;
    fetch(`/api/portal/spotguide/edits?dest=${destId}`).then((r) => r.json()).then((d) => setEdits(d.edits ?? [])).catch(() => {});
  }, [sg.loggedIn, destId]);

  async function confirm(id: string) {
    setBusy(id);
    const r = await fetch("/api/portal/spotguide/edits/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editId: id, kind: "confirm" }) });
    setBusy(null);
    if (!r.ok) return;
    const j = await r.json();
    setEdits((list) => list.map((e) => e.id === id ? { ...e, confirms: j.confirms ?? e.confirms + 1, iConfirmed: true, justLive: j.applied } : e));
  }

  if (!sg.loggedIn || edits.length === 0) return null;

  return (
    <section>
      <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-1">Help review corrections</h2>
      <p className="text-[13px] text-[#6a7a80] mb-3">Members suggested these fixes. Know the spot? Confirm the change is right — it goes live once enough members agree.</p>
      <div className="space-y-2.5">
        {edits.map((e) => (
          <div key={e.id} className="rounded-2xl border border-[#ece3d3] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#00374a]"><span className="text-[#6a7a80] font-semibold">{e.spotName}</span> · {e.fieldLabel}</p>
                <p className="text-[13.5px] text-[#5a6b72] mt-1">
                  <span className="line-through text-[#adb7bb]">{e.from}</span>
                  <span className="mx-1.5 text-[#c3b9a6]">→</span>
                  <span className="font-semibold text-[#00374a]">{e.to}</span>
                </p>
                {e.note && <p className="text-[12.5px] text-[#6a7a80] mt-1 italic">“{e.note}”</p>}
              </div>
              {e.required > 0 && <span className="shrink-0 text-[12px] font-bold" style={{ color: accent }}>{e.confirms}/{e.required}</span>}
            </div>
            <div className="mt-3">
              {e.justLive ? (
                <span className="text-[13px] font-bold text-[#1f9e57]">Applied — thanks! 🎉</span>
              ) : e.isOwn ? (
                <span className="text-[12.5px] text-[#9aa6ac]">Your suggestion · awaiting other members</span>
              ) : e.iConfirmed ? (
                <span className="text-[12.5px] font-semibold" style={{ color: accent }}>✓ You confirmed this</span>
              ) : (
                <button onClick={() => confirm(e.id)} disabled={busy === e.id} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>
                  {busy === e.id ? "…" : "This is correct"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
