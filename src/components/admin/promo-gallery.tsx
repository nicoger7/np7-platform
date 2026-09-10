"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PROMO_FORMATS, defaultPromoState, type PromoFormat, type PromoState } from "@/lib/promo-template";
import { drawPromo, loadPromoImage, promoImageSources, type PromoFonts } from "@/lib/promo-render";

export type PromoDesignRow = { id: string; name: string; format: string; state: PromoState; updated_at: string };

/**
 * Every saved graphic, as a wall of real previews. This is the FRONT DOOR of
 * Promo Studio, not a dialog over it.
 *
 * It began as a dropdown of file names and dates, then as a modal on top of the
 * editor. Both had the same fault, which Nico named: "i need a better overview
 * of the designs. make it a tile view (before being in the editor)." Landing
 * straight in an editor assumes you already know which poster you want. You
 * almost never do. You recognise it.
 *
 * WHY THE THUMBNAILS ARE DRAWN AND NOT STORED. Each card renders its own state
 * through the same canvas the studio and the PNG export use. Nothing to upload,
 * nothing to invalidate, nothing that can go stale: a card is always exactly
 * what the design currently is, including designs edited from another machine.
 * The cost of that is real work per card, which is why nothing is drawn until
 * the card is on screen (see Thumb) and why it is drawn at ~260px rather than
 * at 1080. Fifty designs cost fifty small draws spread over scrolling, not
 * fifty full-size renders on load.
 */
const THUMB_W = 260;

function Thumb({ state, fonts }: { state: PromoState; fonts: PromoFonts }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // No observer (jsdom, an old browser) means draw it and be done: a blank
  // wall is a worse failure than some wasted work.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [drawn, setDrawn] = useState(false);

  // Only pay for a card the eye has actually reached. rootMargin starts the
  // work a screenful early so scrolling meets finished tiles, not spinners.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return;
    const fmt = (state.format ?? "45") as PromoFormat;
    const { w, h } = PROMO_FORMATS[fmt] ?? PROMO_FORMATS["45"];
    const scale = THUMB_W / w;
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
  }, [visible, state, fonts]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg flex items-center justify-center"
      /*
       * Every card is the same 4:5 window, whatever shape the poster is, and a
       * 9:16 story letterboxes inside it. Sizing each card to its own design
       * made the grid rows ragged and a story twice the visual weight of a
       * feed post, which is the opposite of what a wall of thumbnails is for.
       * Fixing the shape also reserves the space before anything is drawn, so
       * the page does not reflow (and re-trigger the observer) card by card.
       */
      style={{ background: "var(--admin-input-bg,#eef2f3)", aspectRatio: "4 / 5" }}
    >
      <canvas ref={ref} className="block" style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }} />
      {!drawn && (
        <div className="absolute inset-0 grid place-items-center text-[11px]" style={{ color: "var(--admin-text-muted,#666)" }}>
          {visible ? "rendering…" : ""}
        </div>
      )}
    </div>
  );
}

const dateLabel = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

export default function PromoGallery({
  designs, fonts, loading, onOpen, onDuplicate, onDelete, onRename, onNew, onNewFromEdition,
}: {
  designs: PromoDesignRow[];
  fonts: PromoFonts;
  loading: boolean;
  onOpen: (d: PromoDesignRow) => void;
  onDuplicate: (d: PromoDesignRow) => void;
  onDelete: (d: PromoDesignRow) => void;
  onRename: (d: PromoDesignRow, name: string) => void;
  onNew: () => void;
  onNewFromEdition: () => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = useMemo(
    () => (term
      ? designs.filter((d) => `${d.name} ${d.state?.source?.label ?? ""}`.toLowerCase().includes(term))
      : designs),
    [designs, term],
  );

  return (
    <div className="fin">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span className="fin-label">{designs.length} saved</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="admin-input ml-auto px-3 py-1.5 rounded-lg text-sm w-52"
          style={{ background: "var(--admin-input-bg,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
        />
        <button onClick={onNewFromEdition} className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}>
          From an experience…
        </button>
        <button onClick={onNew} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
          style={{ background: "var(--admin-accent,#00afdb)" }}>
          New graphic
        </button>
      </div>

      {loading && !designs.length ? (
        <p className="text-sm py-16 text-center admin-muted" style={{ color: "var(--admin-text-muted,#666)" }}>Loading your graphics…</p>
      ) : shown.length === 0 ? (
        <div className="fin-card p-10 text-center" style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)", borderRadius: 18 }}>
          <p className="text-sm mb-3" style={{ color: "var(--admin-text-muted,#666)" }}>
            {designs.length ? "Nothing matches that search." : "No graphics yet. Start from an experience and the dates, place, coach and flag are filled in for you."}
          </p>
          {!designs.length && (
            <button onClick={onNewFromEdition} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "var(--admin-accent,#00afdb)" }}>
              From an experience…
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
          {shown.map((d) => (
            <div key={d.id} className="rounded-xl p-2.5 flex flex-col gap-2"
              style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)" }}>
              <button onClick={() => onOpen(d)} className="block text-left" title="Open in the studio">
                <Thumb state={d.state} fonts={fonts} />
              </button>
              <input
                defaultValue={d.name}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) onRename(d, v); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="w-full px-2 py-1 rounded text-[13px] font-semibold bg-transparent"
                style={{ border: "1px solid transparent", color: "var(--admin-text,#111)" }}
                onFocus={(e) => (e.target.style.border = "1px solid var(--admin-border,#ddd)")}
                title="Rename"
              />
              {d.state?.source?.label && (
                <span className="px-2 -mt-1 text-[11px] truncate" style={{ color: "var(--admin-text-muted,#666)" }} title={d.state.source.label}>
                  {d.state.source.label}
                </span>
              )}
              <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--admin-text-muted,#666)" }}>
                <span>{PROMO_FORMATS[(d.format ?? "45") as PromoFormat]?.label ?? d.format}</span>
                <span>·</span>
                <span title={new Date(d.updated_at).toLocaleString()}>{dateLabel(d.updated_at)}</span>
                <button onClick={() => onDuplicate(d)} className="ml-auto px-1.5 py-0.5 rounded hover:bg-black/5" title="Duplicate">⧉</button>
                <button
                  /* Archive, not erase: DELETE on the route sets archived_at,
                     the house rule for every entity (src/lib/archive.ts). The
                     wording says so rather than promising it is gone. */
                  onClick={() => { if (confirm(`Move "${d.name}" to the archive?`)) onDelete(d); }}
                  className="px-1.5 py-0.5 rounded hover:bg-red-500/10 hover:text-red-500"
                  title="Archive"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A blank design, so "New graphic" means the same thing everywhere. */
export const blankPromo = defaultPromoState;
