"use client";

import { useState } from "react";

/**
 * Turns a trip photo into a branded NP7 "story card" and opens the OS share sheet
 * (Instagram Stories, WhatsApp, …) via the Web Share API — falling back to a
 * download where sharing files isn't supported (desktop). The card is generated
 * server-side (/api/share-card).
 */
export function ShareCardButton({ photo, title, sub, className, label = "Share" }: {
  photo: string; title: string; sub?: string; className?: string; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      const url = `/api/share-card?photo=${encodeURIComponent(photo)}&title=${encodeURIComponent(title)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const file = new File([blob], `np7-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip"}.jpg`, { type: "image/jpeg" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `${title} · NP7 Experience`, text: "My NP7 windsurf trip 🤙🌊" });
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = href; a.download = file.name; a.click();
        URL.revokeObjectURL(href);
      }
      setOk(true); setTimeout(() => setOk(false), 1800);
    } catch { /* user cancelled the share sheet, or it failed — no-op */ }
    finally { setBusy(false); }
  }

  return (
    <button type="button" onClick={share} disabled={busy} aria-label="Share this photo"
      className={className ?? "inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold text-[#00374a] bg-white/95 hover:bg-white disabled:opacity-60 shadow-lg transition-colors"}>
      {busy ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M21 12a9 9 0 1 1-6.2-8.5" strokeLinecap="round" /></svg>
      ) : ok ? (
        <svg className="w-4 h-4 text-[#1f9e57]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
      )}
      {busy ? "Making…" : ok ? "Ready!" : label}
    </button>
  );
}
