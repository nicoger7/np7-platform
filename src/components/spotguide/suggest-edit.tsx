"use client";

import { useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { LevelPicker } from "./level-picker";
import { PinPicker } from "./pin-picker";
import { CONDITIONS } from "@/lib/spotguide";

type Current = { name: string; summary: string | null; description: string | null; level: string | null; conditions: string[]; lat: number | null; lng: number | null };
type Field = "name" | "summary" | "description" | "pin" | "level" | "conditions";
const FIELDS: { key: Field; label: string }[] = [
  { key: "name", label: "Spot name" }, { key: "summary", label: "Summary" },
  { key: "description", label: "Description" }, { key: "pin", label: "Pin location" },
  { key: "level", label: "Level" }, { key: "conditions", label: "Conditions" },
];

/** Member "suggest a correction" — propose a change to one editorial field of an
    existing spot. Lands as a pending edit that resolves by the proposer's
    standing (moderator applies at once; local specialist needs 1 confirm; else 3). */
export function SuggestEdit({ spotId, current, accent = "#00afdb" }: { spotId: string; current: Current; accent?: string }) {
  const sg = useSpotguide();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<Field>("description");
  const [text, setText] = useState("");
  const [conds, setConds] = useState<string[]>(current.conditions ?? []);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(current.lat != null && current.lng != null ? { lat: current.lat, lng: current.lng } : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<"applied" | "pending" | null>(null);

  function pickField(f: Field) {
    setField(f); setError(""); setResult(null);
    if (f === "name") setText(current.name ?? "");
    else if (f === "summary") setText(current.summary ?? "");
    else if (f === "description") setText(current.description ?? "");
    else if (f === "level") setText(current.level ?? "");
    else if (f === "conditions") setConds(current.conditions ?? []);
  }

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    let value: unknown;
    if (field === "pin") { if (!pin) { setError("Drop the corrected pin on the map."); return; } value = pin; }
    else if (field === "conditions") value = conds;
    else if (field === "level") { if (!text) { setError("Pick a level."); return; } value = text; }
    else { if (text.trim().length < (field === "name" ? 2 : 1)) { setError("Add the corrected text."); return; } value = text.trim(); }

    setBusy(true); setError("");
    const res = await fetch("/api/portal/spotguide/edits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotId, field, value, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) { const j = await res.json(); setResult(j.applied ? "applied" : "pending"); }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? "Could not submit."); }
  }

  if (result) {
    return (
      <div className="mt-2 rounded-xl border border-[#cdeede] bg-[#f0faf4] p-3.5 text-[13px] font-semibold text-[#1f7a4d]">
        {result === "applied" ? "Fixed — thanks, that's live now. 🤙" : "Suggested — other members will confirm it before it goes live. 🙏"}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => (sg.loggedIn ? setOpen(true) : sg.needAuth())}
        className="mt-2 text-[12.5px] font-semibold text-[#9aa6ac] hover:text-[#5a6b72] transition-colors">
        Something off here? <span style={{ color: accent }}>Suggest a correction →</span>
      </button>
    );
  }

  const input = "w-full px-3.5 py-2.5 rounded-lg border border-[#e2d8c6] text-[14px] text-[#00374a] outline-none focus:border-[#9aa6ac] bg-white";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${on ? "text-white" : "text-[#5a6b72] border border-[#e2d8c6]"}`;

  return (
    <div className="mt-2 rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-extrabold text-[#00374a]">Suggest a correction</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-[#9aa6ac]">Cancel</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FIELDS.map((f) => (
          <button key={f.key} type="button" onClick={() => pickField(f.key)} className={chip(field === f.key)} style={field === f.key ? { backgroundColor: accent } : undefined}>{f.label}</button>
        ))}
      </div>

      {field === "name" && <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Corrected spot name" autoFocus />}
      {field === "summary" && <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Corrected one-line summary" autoFocus />}
      {field === "description" && <textarea className={`${input} min-h-[96px] resize-y`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Corrected description" autoFocus />}
      {field === "level" && <LevelPicker value={text} onChange={setText} accent={accent} />}
      {field === "conditions" && (
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => <button key={c.key} type="button" onClick={() => setConds((p) => p.includes(c.key) ? p.filter((x) => x !== c.key) : [...p, c.key])} className={chip(conds.includes(c.key))} style={conds.includes(c.key) ? { backgroundColor: accent } : undefined}>{c.label}</button>)}
        </div>
      )}
      {field === "pin" && <PinPicker value={pin} onChange={setPin} height={200} />}

      <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional — helps others confirm)" />
      {error && <p className="text-[12.5px] text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>{busy ? "Submitting…" : "Submit correction"}</button>
        <span className="text-[11px] text-[#9aa6ac]">Reviewed before it goes live</span>
      </div>
    </div>
  );
}
