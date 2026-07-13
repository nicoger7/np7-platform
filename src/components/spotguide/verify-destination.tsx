"use client";

import { useState } from "react";
import { COMMUNITY_VERIFY_THRESHOLD } from "@/lib/spotguide";

/**
 * The verification ladder for a rider-proposed AREA — sits at the very bottom
 * of a draft destination page. 3 member confirms (or a local/NP7) publish the
 * area; until then it's members-only. Mirrors the spot ladder's tone.
 */
export function VerifyDestination({ destId, name, initial, isOwn, accent = "#00afdb" }: {
  destId: string; name: string;
  initial: { confirms: number; flags: number; mine: "confirm" | "flag" | null };
  isOwn: boolean; accent?: string;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");

  async function vote(kind: "confirm" | "flag", note?: string) {
    setBusy(true);
    const r = await fetch("/api/portal/spotguide/verify-destination", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: destId, kind, note: note?.trim() || undefined }),
    }).catch(() => null);
    setBusy(false);
    setFlagOpen(false); setFlagNote("");
    if (!r?.ok) return;
    const j = await r.json();
    setState({ confirms: j.confirms ?? state.confirms, flags: j.flags ?? state.flags, mine: kind });
    if (j.published) setPublished(true);
  }

  return (
    <section className="rounded-2xl border-2 border-dashed border-[#e2d0a8] bg-[#fdf8ee] p-5 sm:p-6">
      <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#b0791e]">Proposed area — riders decide</p>
      {published ? (
        <p className="mt-2 text-[15px] font-bold text-[#1f9e57]">{name} is now officially in the guide — thanks! 🎉</p>
      ) : isOwn ? (
        <p className="mt-2 text-[13.5px] text-[#6a7a80]">
          You proposed this area. It goes live once <b>{COMMUNITY_VERIFY_THRESHOLD} riders confirm it</b> (or one of its spots gets verified) — share it with someone who knows the place. 🤙
        </p>
      ) : (
        <>
          <p className="mt-2 text-[13.5px] text-[#6a7a80]">
            A member proposed <b>{name}</b> as a windsurf area. Been here? Your word makes it official —
            <span className="font-bold" style={{ color: accent }}> {state.confirms}/{COMMUNITY_VERIFY_THRESHOLD} confirms</span>.
            Verifying its spots below counts too.
          </p>
          <div className="flex items-center gap-2.5 mt-3.5">
            <button onClick={() => vote("confirm")} disabled={busy || state.mine === "confirm"}
              className="px-4 py-2 rounded-full text-[13.5px] font-bold text-white disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: "#1f9e57" }}>
              {state.mine === "confirm" ? "✓ You confirmed it" : "✓ It's a real windsurf area"}
            </button>
            <button onClick={() => setFlagOpen((o) => !o)} disabled={busy}
              className={`px-4 py-2 rounded-full text-[13.5px] font-bold border transition-colors ${state.mine === "flag" ? "bg-[#c05a34] text-white border-transparent" : "text-[#b4522f] border-[#f0d9d0] hover:bg-[#fdf3ef]"}`}>
              {state.mine === "flag" ? "✕ You flagged it" : "✕ Something's off"}
            </button>
          </div>
          {flagOpen && (
            <div className="mt-3 rounded-xl border border-[#f0d9d0] bg-white p-3">
              <p className="text-[12px] font-semibold text-[#b4522f] mb-1.5">What&apos;s off? <span className="font-normal text-[#9aa6ac]">A line helps NP7 sort it (optional).</span></p>
              <textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} rows={2}
                className="w-full px-2.5 py-2 rounded-lg border border-[#e2d8c6] text-[13px] text-[#00374a] outline-none focus:border-[#c05a34] bg-white resize-y"
                placeholder="e.g. this is the same as an existing area · not a windsurf place · wrong name" />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => vote("flag", flagNote)} disabled={busy} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: "#c05a34" }}>Flag it</button>
                <button onClick={() => { setFlagOpen(false); setFlagNote(""); }} className="text-[12px] font-semibold text-[#9aa6ac]">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
