"use client";

import { useState } from "react";
import Link from "next/link";

/** AI spot intake — paste any free text (rider message, forum post, jibe
 *  research) → a structured DRAFT spot lands in the queue for review. */
export function SpotIntake() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pulled, setPulled] = useState<{ title: string; channel: string | null; via: string; chars: number } | null>(null);
  const [result, setResult] = useState<{
    queued?: boolean;
    spot?: { id: string; name: string; destination_id: string };
    destination?: { id: string; name: string } | null;
    extracted?: { levels: string[]; conditions: string[]; infrastructure: string[]; lat: number | null; lng: number | null };
    notes?: string[];
  } | null>(null);

  /** Pull a video's title + description INTO the box rather than straight into
   *  the AI — a description is half spot knowledge and half timestamps and
   *  sponsor copy, and only you can tell which at a glance. */
  async function pullFromVideo() {
    if (pulling || !videoUrl.trim()) return;
    setPulling(true); setError(""); setPulled(null);
    try {
      const res = await fetch("/api/admin/youtube", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: videoUrl }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Couldn't read that video."); return; }
      // Couldn't read it here — jibe took the link and will watch it itself.
      if (j.queued) { setResult({ queued: true }); setVideoUrl(""); return; }
      const block = [j.title, j.description].filter(Boolean).join("\n\n");
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${block}` : block));
      setPulled({ title: j.title || "", channel: j.channel ?? null, via: j.via, chars: block.length });
      setVideoUrl("");
    } finally { setPulling(false); }
  }

  async function run() {
    if (busy || text.trim().length < 20) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/admin/spotguide/intake", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Something went wrong."); return; }
      setResult(j); setText("");
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-8 rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold admin-heading">AI spot intake</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#0aa3c7]/15 text-[#0aa3c7]">draft only</span>
      </div>
      <p className="text-[12.5px] admin-muted mb-3">Paste anything — a rider&apos;s WhatsApp message, a forum paragraph, your own notes. It becomes a structured <b>draft</b> spot (matched to an existing area, or a new draft area), waiting for your review. Nothing goes public by itself.</p>
      {/* YouTube insert — the description under a spot video is usually a
          better brief than anything anyone would retype. */}
      <div className="flex items-center gap-2 mb-2">
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pullFromVideo(); } }}
          placeholder="Or paste a YouTube link — youtu.be/…"
          className="flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px] admin-input admin-border border outline-none"
          style={{ backgroundColor: "var(--admin-input-bg)" }} />
        <button onClick={pullFromVideo} disabled={pulling || !videoUrl.trim()}
          className="shrink-0 px-3 py-2 rounded-lg text-[13px] font-bold admin-border border admin-heading hover:bg-[var(--admin-surface-hover)] disabled:opacity-40 transition-colors">
          {pulling ? "Reading…" : "Pull text"}
        </button>
      </div>
      {pulled && (
        <p className="text-[12px] admin-muted mb-2">
          Added <b className="admin-heading">{pulled.title || "video"}</b>
          {pulled.channel ? ` · ${pulled.channel}` : ""} — {pulled.chars} characters.{" "}
          {pulled.via === "oembed"
            ? <span className="text-amber-500">Only the title came through (no description available) — add the details yourself below.</span>
            : "Check it below, trim what isn't about the spot, then structure it."}
        </p>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder={`e.g. "El Cabezo in El Médano works best on SW 5-7bft, medium to big waves, rocky entry at low tide, parking right at the beach, gets crowded on weekends…"`}
        className="w-full rounded-lg px-3 py-2 text-[13.5px] admin-input admin-border border outline-none" style={{ backgroundColor: "var(--admin-input-bg)" }} />
      <div className="flex items-center gap-3 mt-2">
        <button onClick={run} disabled={busy || text.trim().length < 20}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] transition-colors">
          {busy ? "Structuring…" : "Structure into a draft spot"}
        </button>
        {error && <span className="text-[12.5px] font-semibold text-red-400">{error}</span>}
      </div>
      {result?.queued && (
        <div className="mt-3 rounded-lg border border-[#0aa3c7]/40 bg-[#0aa3c7]/10 px-3.5 py-3 text-[13px]">
          <p className="font-bold admin-heading">Queued for jibe 🤙</p>
          <p className="admin-muted text-[12px] mt-1">jibe structures new spots on its ~4-hourly spotguide run — the draft will appear in the review queue below once it&apos;s through. Paste the next one whenever.</p>
        </div>
      )}
      {result?.spot && (
        <div className="mt-3 rounded-lg border border-[#2e7d5b]/40 bg-[#0f6e56]/10 px-3.5 py-3 text-[13px]">
          <p className="font-bold admin-heading">
            Draft created: {result.spot.name}
            {result.destination ? <> · new area &ldquo;{result.destination.name}&rdquo; (draft)</> : null}
          </p>
          <p className="admin-muted text-[12px] mt-1">
            {[result.extracted?.levels.join("/") || null,
              result.extracted?.conditions.join(", ") || null,
              result.extracted?.infrastructure.join(", ") || null,
              result.extracted?.lat != null ? `pin ${result.extracted.lat.toFixed(3)}, ${result.extracted.lng?.toFixed(3)}` : null,
            ].filter(Boolean).join(" · ") || "No structured fields extracted — review the text fields."}
          </p>
          {(result.notes ?? []).length > 0 && (
            <ul className="mt-1.5 text-[12px] text-amber-500 list-disc pl-4">{(result.notes ?? []).map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
          <Link href={`/admin/destinations/${result.spot.destination_id}`} className="inline-block mt-2 text-[12.5px] font-bold text-[#0aa3c7] hover:underline">
            Review &amp; publish in the destination editor →
          </Link>
        </div>
      )}
    </div>
  );
}
