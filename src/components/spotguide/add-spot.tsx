"use client";

import { useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { CONDITIONS, INFRASTRUCTURE_TAGS } from "@/lib/spotguide";
import { PinPicker } from "./pin-picker";
import { LevelPicker } from "./level-picker";

/** Member "add a spot" form. Submits within our structure → lands pending,
    goes public once 3 members confirm (or NP7 verifies). On a destination page
    it's fixed to that destination; on the index it shows a destination picker
    (existing area, or name a NEW area → creates a pending destination). */
export function AddSpot({ destId, destName, destinations, accent = "#00afdb" }: { destId?: string; destName?: string; destinations?: { id: string; name: string }[]; accent?: string }) {
  const sg = useSpotguide();
  const chooseDest = !destId && !!destinations;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ name: "", summary: "", description: "", level: "", conditions: [] as string[], infrastructure: [] as string[] });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [destChoice, setDestChoice] = useState(""); // "" | destId | "__new__"
  const [newArea, setNewArea] = useState("");

  function toggle(list: "conditions" | "infrastructure", v: string) {
    setF((p) => ({ ...p, [list]: p[list].includes(v) ? p[list].filter((x) => x !== v) : [...p[list], v] }));
  }
  function addCustomTag() {
    const t = customTag.trim().slice(0, 40);
    if (!t) return;
    setF((p) => ({ ...p, infrastructure: p.infrastructure.includes(t) ? p.infrastructure : [...p.infrastructure, t] }));
    setCustomTag("");
  }

  async function submit() {
    if (f.name.trim().length < 2) { setError("Give the spot a name."); return; }
    if (!pin) { setError("Drop a pin on the map so we know exactly where it is."); return; }
    let dest: Record<string, string> = { destination_id: destId ?? "" };
    if (chooseDest) {
      if (destChoice === "__new__") {
        if (newArea.trim().length < 2) { setError("Name the new area."); return; }
        dest = { new_destination: newArea.trim() };
      } else if (destChoice) dest = { destination_id: destChoice };
      else { setError("Pick a destination or name a new area."); return; }
    }
    setBusy(true); setError("");
    const res = await fetch("/api/portal/spotguide/spots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dest, ...f, coords: `${pin.lat}, ${pin.lng}` }),
    });
    setBusy(false);
    if (res.ok) { setDone(true); setOpen(false); }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? "Could not submit."); }
  }

  if (done) return <div className="rounded-2xl border border-[#cdeede] bg-[#f0faf4] p-5 text-[14px] text-[#1f7a4d] font-semibold">Thanks — your spot is in for verification. Once a few members confirm it, it goes live for everyone. 🤙</div>;

  if (!open) {
    return (
      <button onClick={() => (sg.loggedIn ? setOpen(true) : sg.needAuth())}
        className="w-full rounded-2xl border-2 border-dashed p-5 text-left transition-colors hover:bg-white"
        style={{ borderColor: "#e2d8c6" }}>
        <span className="text-[15px] font-extrabold text-[#00374a]">{destName ? `Know a spot in ${destName} we're missing?` : "Know a spot we're missing? Add it"}</span>
        <span className="block text-[13px] text-[#6a7a80] mt-0.5">{sg.loggedIn ? (chooseDest ? "Add it to any destination — or name a whole new area. Members verify it before it's public." : "Add it — other members verify it before it goes public.") : "Sign up (seconds) to add a spot — members verify it before it goes public."}</span>
      </button>
    );
  }

  const input = "w-full px-3.5 py-2.5 rounded-lg border border-[#e2d8c6] text-[14px] text-[#00374a] outline-none focus:border-[#9aa6ac] bg-white";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${on ? "text-white" : "text-[#5a6b72] border border-[#e2d8c6]"}`;

  return (
    <div className="rounded-2xl border border-[#ece3d3] bg-white p-5 space-y-3">
      <p className="text-[15px] font-extrabold text-[#00374a]">{destName ? `Add a spot in ${destName}` : "Add a spot"}</p>
      {chooseDest && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Where is it?</p>
          <select className={input} value={destChoice} onChange={(e) => setDestChoice(e.target.value)}>
            <option value="">Pick a destination…</option>
            {destinations!.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value="__new__">➕ A new destination (not listed)</option>
          </select>
          {destChoice === "__new__" && (
            <input className={`${input} mt-2`} placeholder="Name the area / town (e.g. Prasonisi, Rhodes) *" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
          )}
        </div>
      )}
      <input className={input} placeholder="Spot name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
      <input className={input} placeholder="One-line summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      <textarea className={`${input} min-h-[80px] resize-y`} placeholder="What's it like here — wind, water, launch, hazards…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Level it suits</p>
        <LevelPicker value={f.level} onChange={(v) => setF({ ...f, level: v })} accent={accent} />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Where is it? *</p>
        <PinPicker value={pin} onChange={setPin} />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Conditions</p>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => <button key={c.key} onClick={() => toggle("conditions", c.key)} className={chip(f.conditions.includes(c.key))} style={f.conditions.includes(c.key) ? { backgroundColor: accent } : undefined}>{c.label}</button>)}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">On site &amp; local knowledge</p>
        <div className="flex flex-wrap gap-1.5">
          {INFRASTRUCTURE_TAGS.map((t) => <button key={t} type="button" onClick={() => toggle("infrastructure", t)} className={chip(f.infrastructure.includes(t))} style={f.infrastructure.includes(t) ? { backgroundColor: accent } : undefined}>{t}</button>)}
          {f.infrastructure.filter((t) => !INFRASTRUCTURE_TAGS.includes(t as typeof INFRASTRUCTURE_TAGS[number])).map((t) => (
            <button key={t} type="button" onClick={() => toggle("infrastructure", t)} className={chip(true)} style={{ backgroundColor: accent }}>{t} ✕</button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
            placeholder="Add your own — e.g. shallow reef, expert-only, no-kite zone…" className={`${input} text-[13px]`} />
          <button type="button" onClick={addCustomTag} className="shrink-0 px-3 py-2 rounded-lg text-[13px] font-bold" style={{ border: `1px solid ${accent}`, color: accent }}>Add</button>
        </div>
      </div>
      {error && <p className="text-[12.5px] text-red-500">{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button onClick={submit} disabled={busy} className="px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>{busy ? "Submitting…" : "Submit spot"}</button>
        <button onClick={() => setOpen(false)} className="text-[13px] font-semibold text-[#6a7a80]">Cancel</button>
        <span className="ml-auto text-[11px] text-[#9aa6ac]">Verified by members before it&apos;s public</span>
      </div>
    </div>
  );
}
