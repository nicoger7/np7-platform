"use client";

import { useEffect, useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { COMMUNITY_VERIFY_THRESHOLD, conditionLabel } from "@/lib/spotguide";
import { satImage } from "@/lib/satellite";

type Cat = { confirms: number; flags: number; mine: "confirm" | "flag" | null };
type Pending = {
  id: string; name: string; level: string | null; conditions: string[]; description: string | null;
  lat: number | null; lng: number | null;
  isOwn: boolean; cats: { location: Cat; level: Cat; conditions: Cat }; justLive?: boolean; justHidden?: boolean;
};

// Tight satellite view centred on the pin — with a marker dead-centre, this shows
// a verifier EXACTLY where the spot sits so "correctly placed?" is answerable.
// Uses the shared cached satellite (served from our CDN after the first hit).
const pinSatellite = (lat: number, lng: number) => satImage(lat, lng, { dLat: 0.013, w: 720, h: 320 });

/** "Help verify" — pending member spots. Verifiers confirm/flag each fact
    separately: LOCATION gates going public (3 confirms → live, 3 flags → pulled
    for NP7), while LEVEL & CONDITIONS collect advisory votes so the submitter
    sees exactly what's off. A member can't verify their own. */
export function VerifySpots({ destId, accent = "#00afdb" }: { destId: string; accent?: string }) {
  const sg = useSpotguide();
  const [spots, setSpots] = useState<Pending[]>([]);
  const [fieldVerify, setFieldVerify] = useState(false); // per-field level/conditions votes (migration 066)
  const [busy, setBusy] = useState<string | null>(null);
  // Open when something is actually waiting: folded-by-default made the whole
  // verification loop invisible — riders never saw there was anything to confirm.
  const [open, setOpen] = useState(true);
  const [flagFor, setFlagFor] = useState<string | null>(null); // spotId being flagged → ask why
  const [flagNote, setFlagNote] = useState("");

  useEffect(() => {
    if (!sg.loggedIn) return;
    fetch(`/api/portal/spotguide/spots?dest=${destId}`).then((r) => r.json()).then((d) => { setSpots(d.spots ?? []); setFieldVerify(!!d.fieldVerify); }).catch(() => {});
  }, [sg.loggedIn, destId]);

  async function vote(id: string, category: "location" | "level" | "conditions", kind: "confirm" | "flag", note?: string) {
    const key = `${id}:${category}`;
    setBusy(key);
    const r = await fetch("/api/portal/spotguide/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spotId: id, category, kind, note: note?.trim() || undefined }) });
    setBusy(null);
    if (category === "location" && kind === "flag") { setFlagFor(null); setFlagNote(""); }
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
    <section className="rounded-2xl border border-[#ece3d3] bg-white/60 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-[#fdf8ee] transition-colors">
        <span className="min-w-0">
          <span className="block text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac]">Help verify <span style={{ color: accent }}>({spots.length})</span></span>
          <span className="block text-[12.5px] text-[#6a7a80]">Members added these — been to one? Confirm what&apos;s right, flag what&apos;s off.</span>
        </span>
        <svg className={`w-5 h-5 shrink-0 text-[#9aa6ac] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
      <div className="px-4 sm:px-5 pb-4 pt-1 space-y-2.5 border-t border-[#f0e9da]">
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

              {/* Where it is — so you can actually judge "correctly placed?" */}
              {s.lat != null && s.lng != null && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer"
                  className="group relative mt-2.5 block h-32 rounded-xl overflow-hidden border border-[#e2d8c6]" title="Open in Google Maps">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pinSatellite(s.lat, s.lng)} alt={`Where ${s.name} is`} loading="lazy" className="w-full h-full object-cover" />
                  {/* marker dead-centre = the exact pin */}
                  <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill={accent} stroke="#fff" strokeWidth="1.5"><path d="M12 2c-3.9 0-7 3.1-7 7 0 5 7 13 7 13s7-8 7-13c0-3.9-3.1-7-7-7z" /><circle cx="12" cy="9" r="2.4" fill="#fff" stroke="none" /></svg>
                  </span>
                  <span className="absolute bottom-1.5 right-2 text-[10px] font-bold text-white/90 bg-black/40 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Open in Maps ↗</span>
                </a>
              )}

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
                          <button onClick={() => (row.gate ? (setFlagFor(flagFor === s.id ? null : s.id), setFlagNote("")) : vote(s.id, row.key, "flag"))} disabled={busy === k} aria-label="Off" title={row.gate ? "Not accurate — tell us what's off" : "This is wrong"}
                            className={chip(cat.mine === "flag" || (!!row.gate && flagFor === s.id), "no")} style={cat.mine === "flag" ? { backgroundColor: "#c05a34" } : undefined}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                  {flagFor === s.id && (
                    <div className="mt-2 rounded-lg border border-[#f0d9d0] bg-[#fdf6f3] p-2.5">
                      <p className="text-[12px] font-semibold text-[#b4522f] mb-1.5">What&apos;s off? <span className="font-normal text-[#9aa6ac]">A line helps NP7 fix it faster (optional).</span></p>
                      <textarea value={flagNote} onChange={(e) => setFlagNote(e.target.value)} rows={2}
                        className="w-full px-2.5 py-2 rounded-lg border border-[#e2d8c6] text-[13px] text-[#00374a] outline-none focus:border-[#c05a34] bg-white resize-y"
                        placeholder="e.g. the pin is ~200 m off · this spot doesn't exist · the name is wrong" />
                      <div className="flex items-center gap-2 mt-1.5">
                        <button onClick={() => vote(s.id, "location", "flag", flagNote)} disabled={busy === `${s.id}:location`} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: "#c05a34" }}>Flag it</button>
                        <button onClick={() => { setFlagFor(null); setFlagNote(""); }} className="text-[12px] font-semibold text-[#9aa6ac]">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!done && !s.isOwn && <p className="mt-2 text-[11px] text-[#b3a994]">✓ what&apos;s right · ✕ what&apos;s off — only the top row decides if it goes public.</p>}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
