"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { COMMUNITY_VERIFY_THRESHOLD, conditionLabel } from "@/lib/spotguide";

type Cat = { confirms: number; flags: number; mine: "confirm" | "flag" | null };
type Pending = {
  id: string; name: string; level: string | null; conditions: string[]; description: string | null;
  isOwn: boolean; cats: { location: Cat; level: Cat; conditions: Cat }; justLive?: boolean; justHidden?: boolean;
};

/** "Help verify" — pending member spots. Verifiers confirm/flag each fact
    separately: LOCATION gates going public (3 confirms → live, 3 flags → pulled
    for NP7), while LEVEL & CONDITIONS collect advisory votes so the submitter
    sees exactly what's off. A member can't verify their own. */
export function VerifySpots({ destId, accent = "#00afdb" }: { destId: string; accent?: string }) {
  const sg = useSpotguide();
  const [spots, setSpots] = useState<Pending[]>([]);
  const [fieldVerify, setFieldVerify] = useState(false); // per-field level/conditions votes (migration 066)
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!sg.loggedIn) return;
    fetch(`/api/portal/spotguide/spots?dest=${destId}`).then((r) => r.json()).then((d) => { setSpots(d.spots ?? []); setFieldVerify(!!d.fieldVerify); }).catch(() => {});
  }, [sg.loggedIn, destId]);

  async function vote(id: string, category: "location" | "level" | "conditions", kind: "confirm" | "flag") {
    const key = `${id}:${category}`;
    setBusy(key);
    const r = await fetch("/api/portal/spotguide/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spotId: id, category, kind }) });
    setBusy(null);
    if (!r.ok) return;
    const j = await r.json();
    setSpots((list) => list.map((s) => {
      if (s.id !== id) return s;
      const cats = { ...s.cats, [category]: { confirms: j.confirms, flags: j.flags, mine: kind } };
      return { ...s, cats, justLive: s.justLive || (category === "location" && j.verification === "community"), justHidden: s.justHidden || (category === "location" && j.hidden) };
    }));
  }

  if (!sg.loggedIn || spots.length === 0) return null;

  return (
    <section>
      <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-1">Help verify</h2>
      <p className="text-[13px] text-[#6a7a80] mb-3">Members added these spots. Been to one? Confirm what&apos;s right and flag what&apos;s off — {COMMUNITY_VERIFY_THRESHOLD} location confirmations make it public.</p>
      <div className="space-y-2.5">
        {spots.map((s) => {
          const rows: { key: "location" | "level" | "conditions"; label: string; value: string | null; gate?: boolean }[] = [
            { key: "location", label: "Real spot, correctly placed?", value: null, gate: true },
            ...(fieldVerify && s.level ? [{ key: "level" as const, label: "Level", value: s.level }] : []),
            ...(fieldVerify && s.conditions.length ? [{ key: "conditions" as const, label: "Conditions", value: s.conditions.map(conditionLabel).join(" · ") }] : []),
          ];
          const done = s.justLive || s.justHidden;
          return (
            <div key={s.id} className="rounded-2xl border border-[#ece3d3] bg-white p-4">
              <p className="text-[15px] font-extrabold text-[#00374a]">{s.name}</p>
              {s.description && <p className="text-[13px] text-[#6a7a80] mt-1 line-clamp-2">{s.description}</p>}

              {s.justLive ? (
                <p className="mt-3 text-[13px] font-bold text-[#1f9e57]">Now live for everyone — thanks! 🎉</p>
              ) : s.justHidden ? (
                <p className="mt-3 text-[13px] font-bold text-[#b4522f]">Flagged — we&apos;ll review it. Thanks!</p>
              ) : s.isOwn ? (
                <p className="mt-3 text-[12.5px] text-[#9aa6ac]">Your submission · awaiting other members</p>
              ) : (
                <div className="mt-3 divide-y divide-[#f2ece1]">
                  {rows.map((row) => {
                    const cat = s.cats[row.key];
                    const k = `${s.id}:${row.key}`;
                    const chip = (active: boolean, tone: "ok" | "no") =>
                      `inline-flex items-center justify-center w-8 h-8 rounded-full text-[14px] font-bold transition-colors disabled:opacity-50 ${
                        active ? "text-white" : tone === "ok" ? "text-[#1f9e57] border border-[#cdeede]" : "text-[#b4522f] border border-[#f0d9d0]"
                      }`;
                    return (
                      <div key={row.key} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0 text-[13.5px]">
                          <span className="font-bold text-[#00374a]">{row.label}</span>
                          {row.value && <span className="text-[#6a7a80]">: {row.value}</span>}
                          {row.gate
                            ? <span className="ml-2 text-[11px] font-bold" style={{ color: accent }}>{cat.confirms}/{COMMUNITY_VERIFY_THRESHOLD}</span>
                            : (cat.confirms + cat.flags > 0) && <span className="ml-2 text-[11px] text-[#9aa6ac]">✓{cat.confirms} · ✗{cat.flags}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => vote(s.id, row.key, "confirm")} disabled={busy === k} aria-label="Right" title={row.gate ? "I've been here — accurate" : "This is right"}
                            className={chip(cat.mine === "confirm", "ok")} style={cat.mine === "confirm" ? { backgroundColor: "#1f9e57" } : undefined}>✓</button>
                          <button onClick={() => vote(s.id, row.key, "flag")} disabled={busy === k} aria-label="Off" title={row.gate ? "Not accurate" : "This is wrong"}
                            className={chip(cat.mine === "flag", "no")} style={cat.mine === "flag" ? { backgroundColor: "#c05a34" } : undefined}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!done && !s.isOwn && <p className="mt-2 text-[11px] text-[#b3a994]">✓ what&apos;s right · ✕ what&apos;s off — only the top row decides if it goes public.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
