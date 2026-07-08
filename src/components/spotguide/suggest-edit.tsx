"use client";

import { useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { PinPicker } from "./pin-picker";

type Current = { name: string; lat: number | null; lng: number | null };
type Field = "info" | "name" | "pin";
const FIELDS: { key: Field; label: string }[] = [
  { key: "info", label: "Add / correct info" },
  { key: "name", label: "Spot name" },
  { key: "pin", label: "Pin location" },
];

/** Member "suggest a correction". Two kinds: a canonical fix (name / pin) that
    auto-applies once approved, or free-text info that's collected and folded into
    the description by AI/NP7 once enough members confirm it — members never
    overwrite our prose. (Level & conditions aren't here; those aggregate from
    votes in the contribute block.) */
export function SuggestEdit({ spotId, current, accent = "#00afdb" }: { spotId: string; current: Current; accent?: string }) {
  const sg = useSpotguide();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<Field>("info");
  const [text, setText] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(current.lat != null && current.lng != null ? { lat: current.lat, lng: current.lng } : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<"applied" | "pending" | null>(null);

  function pickField(f: Field) {
    setField(f); setError(""); setResult(null);
    setText(f === "name" ? current.name ?? "" : "");
  }

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    let value: unknown;
    if (field === "pin") { if (!pin) { setError("Drop the corrected pin on the map."); return; } value = pin; }
    else if (field === "name") { if (text.trim().length < 2) { setError("Add the corrected name."); return; } value = text.trim(); }
    else { if (text.trim().length < 3) { setError("Add a little detail."); return; } value = text.trim(); }

    setBusy(true); setError("");
    const res = await fetch("/api/portal/spotguide/edits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotId, field, value, note: field === "info" ? undefined : note.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) { const j = await res.json(); setResult(j.applied ? "applied" : "pending"); }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? "Could not submit."); }
  }

  if (result) {
    return (
      <div className="mt-2 rounded-xl border border-[#cdeede] bg-[#f0faf4] p-3.5 text-[13px] font-semibold text-[#1f7a4d]">
        {result === "applied" ? "Fixed — thanks, that's live now. 🤙" : "Thanks — the crew will review it and fold it in. 🙏"}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => (sg.loggedIn ? setOpen(true) : sg.needAuth())}
        className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#e2d8c6] bg-white px-4 py-2 text-[12.5px] font-bold text-[#5a6b72] hover:border-[#c9bda5] hover:text-[#00374a] transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
        Something off? <span style={{ color: accent }}>Suggest a correction</span>
      </button>
    );
  }

  const input = "w-full px-3.5 py-2.5 rounded-lg border border-[#e2d8c6] text-[14px] text-[#00374a] outline-none focus:border-[#9aa6ac] bg-white";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${on ? "text-white" : "text-[#5a6b72] border border-[#e2d8c6]"}`;

  return (
    <div className="mt-2 rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-extrabold text-[#00374a]">Add a correction</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-[#9aa6ac]">Cancel</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FIELDS.map((f) => (
          <button key={f.key} type="button" onClick={() => pickField(f.key)} className={chip(field === f.key)} style={field === f.key ? { backgroundColor: accent } : undefined}>{f.label}</button>
        ))}
      </div>

      {field === "info" && (
        <>
          <textarea className={`${input} min-h-[96px] resize-y`} value={text} onChange={(e) => setText(e.target.value)} autoFocus
            placeholder="What should we add or fix? e.g. “there's also a snack bar by the launch”, “the inside is shallower than it says at low tide”." />
          <p className="text-[11px] text-[#9aa6ac]">You&apos;re not rewriting the text — just tell us what to add or correct. Once enough members confirm it, we fold it into the description.</p>
        </>
      )}
      {field === "name" && <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Corrected spot name" autoFocus />}
      {field === "pin" && <PinPicker value={pin} onChange={setPin} height={200} />}

      {field !== "info" && <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional — helps others confirm)" />}
      {error && <p className="text-[12.5px] text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>{busy ? "Submitting…" : "Submit"}</button>
        <span className="text-[11px] text-[#9aa6ac]">Reviewed before it goes live</span>
      </div>
    </div>
  );
}
