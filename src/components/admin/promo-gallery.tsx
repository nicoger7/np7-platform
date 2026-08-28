"use client";

import { useEffect, useRef, useState } from "react";
import { PROMO_FORMATS, defaultPromoState, type PromoFormat, type PromoState } from "@/lib/promo-template";
import { drawPromo, loadPromoImage, promoImageSources, type PromoFonts } from "@/lib/promo-render";

export type PromoDesignRow = { id: string; name: string; format: string; state: PromoState; updated_at: string };

/**
 * Every saved graphic, as a wall of real previews.
 *
 * The saved list used to be a dropdown of file names and dates. Names are what
 * you remember a graphic by least — you remember what it looked like. So each
 * card RENDERS its own stored state through the same canvas the studio uses:
 * no stored thumbnails to upload, invalidate or go stale, and a card is always
 * exactly what the design currently is.
 */
function Thumb({ state, fonts }: { state: PromoState; fonts: PromoFonts }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return;
    const fmt = (state.format ?? "45") as PromoFormat;
    const { w, h } = PROMO_FORMATS[fmt] ?? PROMO_FORMATS["45"];
    const scale = 260 / w;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    (async () => {
      // Wait for the design's own images; a half-loaded card looks broken in a
      // way an empty one does not.
      await Promise.all(promoImageSources(state).map((src) => loadPromoImage(src).catch(() => null)));
      if (cancelled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.scale(scale, scale);
      try { drawPromo(ctx, state, fonts); } catch { /* a broken saved state must not kill the gallery */ }
      ctx.restore();
      setDrawn(true);
    })();
    return () => { cancelled = true; };
  }, [state, fonts]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ background: "var(--admin-input-bg,#eef2f3)" }}>
      <canvas ref={ref} className="block w-full h-auto" />
      {!drawn && <div className="absolute inset-0 grid place-items-center text-[11px]" style={{ color: "var(--admin-text-muted,#666)" }}>rendering…</div>}
    </div>
  );
}

export default function PromoGallery({
  designs, fonts, currentId, onOpen, onDuplicate, onDelete, onRename, onNew, onClose,
}: {
  designs: PromoDesignRow[];
  fonts: PromoFonts;
  currentId: string | null;
  onOpen: (d: PromoDesignRow) => void;
  onDuplicate: (d: PromoDesignRow) => void;
  onDelete: (d: PromoDesignRow) => void;
  onRename: (d: PromoDesignRow, name: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term ? designs.filter((d) => d.name.toLowerCase().includes(term)) : designs;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: "rgba(4,20,26,0.62)" }} onClick={onClose}>
      <div
        className="m-auto w-[min(1100px,94vw)] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--admin-bg,#fff)", border: "1px solid var(--admin-border,#ddd)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--admin-border,#ddd)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--admin-text,#111)" }}>Your graphics</h2>
          <span className="text-xs" style={{ color: "var(--admin-text-muted,#666)" }}>{designs.length}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="ml-auto px-3 py-1.5 rounded-lg text-sm w-52"
            style={{ background: "var(--admin-input-bg,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
          />
          <button onClick={onNew} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#00afdb]">New graphic</button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text-muted,#666)" }}>Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {shown.length === 0 ? (
            <p className="text-sm py-16 text-center" style={{ color: "var(--admin-text-muted,#666)" }}>
              {designs.length ? "Nothing matches that search." : "No saved graphics yet — build one and press Save as new."}
            </p>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
              {shown.map((d) => (
                <div key={d.id} className="rounded-xl p-2.5 flex flex-col gap-2"
                  style={{ background: "var(--admin-surface,#fff)", border: `1px solid ${d.id === currentId ? "#00afdb" : "var(--admin-border,#ddd)"}` }}>
                  <button onClick={() => onOpen(d)} className="block text-left" title="Open in the studio">
                    <Thumb state={d.state} fonts={fonts} />
                  </button>
                  <input
                    defaultValue={d.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) onRename(d, v); }}
                    className="w-full px-2 py-1 rounded text-[13px] font-semibold bg-transparent"
                    style={{ border: "1px solid transparent", color: "var(--admin-text,#111)" }}
                    onFocus={(e) => (e.target.style.border = "1px solid var(--admin-border,#ddd)")}
                    title="Rename"
                  />
                  <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--admin-text-muted,#666)" }}>
                    <span>{PROMO_FORMATS[(d.format ?? "45") as PromoFormat]?.label ?? d.format}</span>
                    <span>·</span>
                    <span>{new Date(d.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    <button onClick={() => onDuplicate(d)} className="ml-auto px-1.5 py-0.5 rounded hover:bg-black/5" title="Duplicate">⧉</button>
                    <button
                      onClick={() => { if (confirm(`Delete "${d.name}"? This cannot be undone.`)) onDelete(d); }}
                      className="px-1.5 py-0.5 rounded hover:bg-red-500/10 hover:text-red-500"
                      title="Delete"
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A blank design, so "New graphic" means the same thing everywhere. */
export const blankPromo = defaultPromoState;
