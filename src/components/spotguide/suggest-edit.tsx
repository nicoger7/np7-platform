"use client";

import { useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import { PinPicker } from "./pin-picker";

type Current = { name: string; lat: number | null; lng: number | null };

/** Member "suggest a correction". Three independent things, all fillable at once:
    free-text info folded into the description by AI/NP7 once enough members confirm
    it (members never overwrite our prose), plus canonical name / pin fixes that
    auto-apply once approved. One Submit sends whatever you filled — switching
    between them never wipes anything, and you can add another afterwards. */
export function SuggestEdit({ spotId, current, accent = "#00afdb" }: { spotId: string; current: Current; accent?: string }) {
  const sg = useSpotguide();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState("");
  const [name, setName] = useState(current.name ?? "");
  const [nameOn, setNameOn] = useState(false);
  const hasPin = current.lat != null && current.lng != null;
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(hasPin ? { lat: current.lat as number, lng: current.lng as number } : null);
  const [pinOn, setPinOn] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ applied: number; pending: number } | null>(null);

  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  const infoGiven = info.trim().length >= 3;
  const nameChanged = nameOn && name.trim().length >= 2 && name.trim() !== (current.name ?? "").trim();
  const pinMoved = pinOn && !!pin && (!hasPin || round(pin.lat) !== round(current.lat as number) || round(pin.lng) !== round(current.lng as number));

  async function post(field: "info" | "name" | "pin", value: unknown) {
    const res = await fetch("/api/portal/spotguide/edits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotId, field, value, note: field === "info" ? undefined : note.trim() || undefined }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not submit.");
    return (await res.json()).applied as boolean;
  }

  async function submit() {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    const jobs: { field: "info" | "name" | "pin"; value: unknown }[] = [];
    if (infoGiven) jobs.push({ field: "info", value: info.trim() });
    if (nameChanged) jobs.push({ field: "name", value: name.trim() });
    if (pinMoved) jobs.push({ field: "pin", value: pin });
    if (jobs.length === 0) { setError("Add some info, or correct the name or pin."); return; }

    setBusy(true); setError("");
    let applied = 0, pending = 0;
    try {
      for (const j of jobs) { (await post(j.field, j.value)) ? applied++ : pending++; }
    } catch (e) {
      setBusy(false);
      // if some already went through, still show the result; else surface the error
      if (applied + pending === 0) { setError(e instanceof Error ? e.message : "Could not submit."); return; }
    }
    setBusy(false);
    setResult({ applied, pending });
  }

  function addAnother() {
    setInfo(""); setName(current.name ?? ""); setNameOn(false);
    setPin(hasPin ? { lat: current.lat as number, lng: current.lng as number } : null); setPinOn(false);
    setNote(""); setError(""); setResult(null);
  }

  if (result) {
    const { applied, pending } = result;
    const msg = applied > 0 && pending === 0 ? "Fixed — that's live now. 🤙"
      : applied > 0 ? "Some fixes are live; the rest the crew will review and fold in. 🙏"
      : "Thanks — the crew will review it and fold it in. 🙏";
    return (
      <div className="mt-2 rounded-xl border border-[#cdeede] bg-[#f0faf4] p-3.5">
        <p className="text-[13px] font-semibold text-[#1f7a4d]">{msg}</p>
        <button type="button" onClick={addAnother} className="mt-2 text-[12.5px] font-bold" style={{ color: accent }}>＋ Add another correction</button>
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
  const toggle = (on: boolean) => `px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${on ? "text-white" : "text-[#5a6b72] border border-[#e2d8c6] bg-white hover:border-[#c9bda5]"}`;

  return (
    <div className="mt-2 rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-extrabold text-[#00374a]">Add a correction</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-[#9aa6ac]">Cancel</button>
      </div>

      {/* Info — the primary case, always here */}
      <div>
        <textarea className={`${input} min-h-[96px] resize-y`} value={info} onChange={(e) => setInfo(e.target.value)} autoFocus
          placeholder="What should we add or fix? e.g. “there's also a snack bar by the launch”, “the inside is shallower than it says at low tide”." />
        <p className="text-[11px] text-[#9aa6ac] mt-1">You&apos;re not rewriting the text — just tell us what to add or correct. Once enough members confirm it, we fold it into the description.</p>
      </div>

      {/* Optional canonical fixes — toggle them on; your text is never lost */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button type="button" onClick={() => setNameOn((v) => !v)} className={toggle(nameOn)} style={nameOn ? { backgroundColor: accent } : undefined}>{nameOn ? "✓ " : "＋ "}Correct the name</button>
        <button type="button" onClick={() => setPinOn((v) => !v)} className={toggle(pinOn)} style={pinOn ? { backgroundColor: accent } : undefined}>{pinOn ? "✓ " : "＋ "}Move the pin</button>
      </div>

      {nameOn && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Corrected spot name</p>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Corrected spot name" />
        </div>
      )}
      {pinOn && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Drag the pin to the right spot</p>
          <PinPicker value={pin} onChange={setPin} height={200} />
        </div>
      )}
      {(nameOn || pinOn) && (
        <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional — helps others confirm the name / pin fix)" />
      )}

      {error && <p className="text-[12.5px] text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>{busy ? "Submitting…" : "Submit"}</button>
        <span className="text-[11px] text-[#9aa6ac]">Reviewed before it goes live</span>
      </div>
    </div>
  );
}
