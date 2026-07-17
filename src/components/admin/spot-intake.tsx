"use client";

import { useState } from "react";
import Link from "next/link";

/** AI spot intake — paste any free text (rider message, forum post, jibe
 *  research) → a structured DRAFT spot lands in the queue for review. */
export function SpotIntake() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    queued?: boolean;
    spot?: { id: string; name: string; destination_id: string };
    destination?: { id: string; name: string } | null;
    extracted?: { levels: string[]; conditions: string[]; infrastructure: string[]; lat: number | null; lng: number | null };
    notes?: string[];
  } | null>(null);

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
