"use client";

import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { BrandedTile } from "@/components/experience/branded-tile";
import { resolveTilePlacement, TILE_PLACEMENT_DEFAULTS, type FlagInfo, type TilePlacement } from "@/lib/experience-tile";
import { encodeFocus, focusOf, focusPoint, hasOwnFocus, parseFocus, withFocus, type FocusShape } from "@/lib/placement";

/* ────────────────────────────────────────────────────────────────────────────
   Shared drag helper: reports the pointer position as 0–100 % of an element,
   during pointerdown → move → up. Reliable on mouse + touch (pointer events).
──────────────────────────────────────────────────────────────────────────── */
function useCanvasDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const emit = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100));
    onMove(Math.round(x), Math.round(y));
  };
  // Window-level move/up listeners for the duration of one gesture — this
  // guarantees the drag always ends (no "stuck" state if the pointer is
  // released off the canvas), and tracks the pointer even outside the element.
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    emit(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => emit(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return { ref, handlers: { onPointerDown } };
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[12px] font-semibold text-[var(--admin-fg-muted,#7a8a90)] mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--admin-fg,#0a2a33)]">{value}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#00afdb]" />
    </label>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CARD placement editor — photo focal point, coach position + size, flag
   position + fade. Live preview across the tile's real aspect-ratio range.
════════════════════════════════════════════════════════════════════════════ */
type TileContent = { photo: string | null; place: string; flag: FlagInfo | null; coachName: string | null; coachCutout: string | null; coaches?: { name: string; cutout: string | null }[] };

// The real tile is fixed-height / fluid-width: aspect ~1.3 (2-col) → ~2.8 (wide
// 1-col). We preview the extremes so placement is safe on every screen.

/**
 * Renders the tile at real card size (360px wide) and scales it down to fit
 * the preview slot — a tile dropped straight into a ~140px box would show its
 * fixed-px typography comically oversized.
 */
function ScaledPreview({ r, children }: { r: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const DESIGN_W = 360;
  return (
    <div ref={ref} className="relative w-full rounded overflow-hidden ring-1 ring-black/5" style={{ aspectRatio: String(r) }}>
      {w > 0 && (
        <div className="group absolute top-0 left-0" style={{ width: DESIGN_W, height: DESIGN_W / r, transform: `scale(${w / DESIGN_W})`, transformOrigin: "top left" }}>
          {children}
        </div>
      )}
    </div>
  );
}

const PREVIEW_ASPECTS = [
  { r: 1.35, label: "Narrow column", note: "tablet / 2-up" },
  { r: 1.73, label: "Standard", note: "desktop 3-up" },
  { r: 2.7, label: "Wide", note: "phone 1-up" },
];

type Elem = "photo" | "coach" | "coach2" | "coach3" | "flag";

export function TilePlacementEditor({ content, value, onChange }: {
  content: TileContent; value: TilePlacement; onChange: (v: TilePlacement) => void;
}) {
  const [active, setActive] = useState<Elem>("photo");
  const p = resolveTilePlacement(value);
  const set = (patch: Partial<TilePlacement>) => onChange({ ...value, ...patch });

  // Drag on the canvas moves whichever element is active. The COACH is
  // horizontally locked (so every tile's coach lines up) — drag only nudges it
  // vertically; use the Size slider for scale.
  const { ref, handlers } = useCanvasDrag((x, y) => {
    if (active === "photo") set({ photoX: x, photoY: y });
    else if (active === "coach") set({ coachBottom: clamp(100 - y, -15, 60) });
    // The extra coaches are left-anchored and free on BOTH axes — only the
    // lead is horizontally locked (that's the cross-tile alignment promise).
    else if (active === "coach2") set({ coach2X: clamp(x - 8, -10, 70), coach2Bottom: clamp(100 - y, -15, 60) });
    else if (active === "coach3") set({ coach3X: clamp(x - 8, -10, 70), coach3Bottom: clamp(100 - y, -15, 60) });
    else set({ flagRight: clamp(100 - x, -20, 70), flagTop: clamp(y - 60, -40, 35) });
  });

  // Marker position (canvas %) for the active element.
  const marker = active === "photo" ? { x: p.photoX, y: p.photoY }
    : active === "coach" ? { x: 100 - p.coachRight, y: 100 - p.coachBottom }
    : active === "coach2" ? { x: p.coach2X + 8, y: 100 - p.coach2Bottom }
    : active === "coach3" ? { x: p.coach3X + 8, y: 100 - p.coach3Bottom }
    : { x: 100 - p.flagRight, y: p.flagTop + 60 };

  const crew = content.coaches ?? (content.coachName ? [{ name: content.coachName, cutout: content.coachCutout }] : []);
  const hasCoach = crew.length > 0;
  const hasFlag = !!content.flag;
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--admin-border,#e3e9ec)] bg-[var(--admin-card,#fff)] p-3.5 sm:p-4 max-w-[440px]">
      {/* element picker */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--admin-fg-muted,#7a8a90)] mr-0.5">Adjust</span>
        {([["photo", "Photo"],
           ["coach", crew.length > 1 ? "Coach 1" : "Coach"],
           // Coach 2 stays VISIBLE when the crew is short — a hidden option is
           // an option nobody discovers. Disabled with the how-to in the title.
           ["coach2", "Coach 2"] as [Elem, string],
           ...(crew.length > 2 ? [["coach3", "Coach 3"] as [Elem, string]] : []),
           ["flag", "Flag"]] as [Elem, string][]).map(([k, lbl]) => {
          const disabled = (k === "coach" && !hasCoach) || (k === "flag" && !hasFlag)
            || (k === "coach2" && crew.length < 2) || (k === "coach3" && crew.length < 3);
          const hint = k === "coach2" && crew.length < 2
            ? "Needs a second coach with a cutout — make one in Coaches → Photo studio" : undefined;
          return (
            <button key={k} type="button" disabled={disabled} title={hint} onClick={() => setActive(k)}
              className={`text-[12.5px] font-bold px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                active === k ? "bg-[#00374a] text-white" : "bg-[var(--admin-chip,#eef3f5)] text-[var(--admin-fg,#0a2a33)] hover:bg-[#dfe8eb]"
              }`}>{lbl}</button>
          );
        })}
        <button type="button" onClick={() => onChange({})}
          className="ml-auto text-[11.5px] font-semibold text-[#c0392b] hover:underline">Reset</button>
      </div>

      {/* editor canvas — drag to place the active element */}
      <div ref={ref} {...handlers}
        className="group relative w-full rounded-lg overflow-hidden cursor-crosshair select-none touch-none ring-1 ring-black/5"
        style={{ aspectRatio: "1.73" }}>
        <BrandedTile photo={content.photo} place={content.place} flag={content.flag}
          coachName={content.coachName} coachCutout={content.coachCutout} coaches={content.coaches} placement={value} />
        <span aria-hidden className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
          style={{ left: `${marker.x}%`, top: `${marker.y}%`, background: "rgba(0,175,219,0.35)" }} />
        <span className="pointer-events-none absolute top-1.5 left-1.5 z-20 text-[9.5px] font-bold uppercase tracking-[0.08em] text-white/90 bg-black/45 rounded px-1.5 py-0.5">
          Drag {active === "coach2" ? "coach 2" : active === "coach3" ? "coach 3" : active}{active === "coach" ? " up/down" : ""}
        </span>
      </div>

      {/* per-element sliders — one compact column */}
      <div className="mt-3 space-y-2">
        {active === "photo" && (
          <>
            <Slider label="Zoom" value={p.photoZoom} min={100} max={200} suffix="%" onChange={(v) => set({ photoZoom: v })} />
            <Slider label="Horizontal" value={p.photoX} min={0} max={100} suffix="%" onChange={(v) => set({ photoX: v })} />
            <Slider label="Vertical" value={p.photoY} min={0} max={100} suffix="%" onChange={(v) => set({ photoY: v })} />
            {p.photoZoom <= 100 && <p className="text-[11px] text-[var(--admin-fg-muted,#7a8a90)]">Tip: zoom in first to free up room to move the photo up/down.</p>}
          </>
        )}
        {active === "coach" && hasCoach && (
          <>
            <Slider label="Size" value={p.coachScale} min={45} max={120} suffix="%" onChange={(v) => set({ coachScale: v })} />
            <Slider label="From bottom" value={p.coachBottom} min={-15} max={50} suffix="%" onChange={(v) => set({ coachBottom: v })} />
            <p className="text-[11px] text-[var(--admin-fg-muted,#7a8a90)]">The lead coach&apos;s side position is locked so every tile lines up.</p>
          </>
        )}
        {active === "coach2" && (
          <>
            <Slider label="Size" value={p.coach2Scale} min={35} max={110} suffix="%" onChange={(v) => set({ coach2Scale: v })} />
            <Slider label="From left" value={p.coach2X} min={-10} max={70} suffix="%" onChange={(v) => set({ coach2X: v })} />
            <Slider label="From bottom" value={p.coach2Bottom} min={-15} max={50} suffix="%" onChange={(v) => set({ coach2Bottom: v })} />
          </>
        )}
        {active === "coach3" && (
          <>
            <Slider label="Size" value={p.coach3Scale} min={35} max={110} suffix="%" onChange={(v) => set({ coach3Scale: v })} />
            <Slider label="From left" value={p.coach3X} min={-10} max={70} suffix="%" onChange={(v) => set({ coach3X: v })} />
            <Slider label="From bottom" value={p.coach3Bottom} min={-15} max={50} suffix="%" onChange={(v) => set({ coach3Bottom: v })} />
          </>
        )}
        {active === "flag" && hasFlag && (
          <>
            <Slider label="From right" value={p.flagRight} min={-20} max={60} suffix="%" onChange={(v) => set({ flagRight: v })} />
            <Slider label="Width" value={p.flagWidth} min={20} max={75} suffix="%" onChange={(v) => set({ flagWidth: v })} />
            <Slider label="Rotation" value={p.flagRotate} min={-25} max={35} suffix="°" onChange={(v) => set({ flagRotate: v })} />
            <Slider label="Opacity" value={p.flagOpacity} min={0} max={100} suffix="%" onChange={(v) => set({ flagOpacity: v })} />
            <Slider label="Fade-off strength" value={p.flagFade} min={0} max={100} suffix="%" onChange={(v) => set({ flagFade: v })} />
          </>
        )}
      </div>

      {/* multi-aspect check — collapsed by default so the editor stays compact */}
      <button type="button" onClick={() => setShowAll((s) => !s)}
        className="mt-3 text-[11.5px] font-semibold text-[#0a7f9e] hover:underline">
        {showAll ? "Hide" : "Check"} how it looks on every screen shape {showAll ? "▲" : "▼"}
      </button>
      {showAll && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {PREVIEW_ASPECTS.map((a) => (
            <div key={a.label}>
              <ScaledPreview r={a.r}>
                <BrandedTile photo={content.photo} place={content.place} flag={content.flag}
                  coachName={content.coachName} coachCutout={content.coachCutout} coaches={content.coaches} placement={value} />
              </ScaledPreview>
              <p className="text-[10px] text-[var(--admin-fg-muted,#7a8a90)] mt-0.5 leading-tight"><span className="font-bold text-[var(--admin-fg,#0a2a33)]">{a.label}</span></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HERO focal-point picker — drag to choose the crop centre, per screen shape.
   The shape chips pick what you are EDITING: desktop is the base, tablet and
   phone inherit it until you drag them somewhere of their own.
════════════════════════════════════════════════════════════════════════════ */

/** A shape the image gets cropped to. `shape` set = it can be framed on its own. */
type FocusAspect = { r: number; label: string; note: string; shape?: FocusShape };

// No `shape` keys: these are three different SURFACES (two pages plus a phone
// card), not three widths of one image, and their renderers still take a single
// position — so this picker stays single-value until they read per-shape too.
export const TILE_ASPECTS: FocusAspect[] = [
  { r: 1.7, label: "Shop card", note: "landing grid" },
  { r: 1.25, label: "Fins card", note: "range page" },
  { r: 0.85, label: "Phone card", note: "tall" },
];

const HERO_ASPECTS: FocusAspect[] = [
  { r: 2.4, label: "Desktop", note: "wide banner", shape: "desktop" },
  { r: 1.5, label: "Tablet", note: "", shape: "tablet" },
  { r: 0.72, label: "Phone", note: "tall", shape: "phone" },
];

/** Where a `cover` crop of ratio `r` actually lands on the full image, in % of it. */
function coverBox(imgAspect: number, r: number, fx: number, fy: number) {
  if (imgAspect > r) {
    const w = r / imgAspect;                       // full height, sides cut
    return { left: (fx / 100) * (1 - w) * 100, top: 0, w: w * 100, h: 100 };
  }
  const h = imgAspect / r;                         // full width, top/bottom cut
  return { left: 0, top: (fy / 100) * (1 - h) * 100, w: 100, h: h * 100 };
}

export function HeroFocusPicker({ image, value, onChange, aspects = HERO_ASPECTS, label = "Drag to set the focal point", onCrop, emptyHint = "Upload a hero image above to set its focal point." }: {
  image: string | null; value: string | null; onChange: (v: string | null) => void;
  /** the real shapes this image gets cropped to — previewed under the canvas */
  aspects?: FocusAspect[];
  label?: string;
  /** offered when framing alone can't save the shot — opens the real cropper */
  onCrop?: () => void;
  emptyHint?: string;
}) {
  // which shape is being edited (and, on the canvas, judged against)
  const [shape, setShape] = useState(0);
  const [imgAspect, setImgAspect] = useState<number | null>(null);

  const focus = parseFocus(value);
  const target = aspects[Math.min(shape, aspects.length - 1)];
  const perShape = aspects.some((a) => a.shape);
  // Surfaces without a shape key share one framing — everything edits `desktop`,
  // and it leaves as the plain css string those renderers already understand.
  const editing: FocusShape = target?.shape ?? "desktop";
  const [fx, fy] = focusPoint(focus, editing);
  const own = perShape && hasOwnFocus(focus, editing);

  const write = (css: string | null) =>
    onChange(perShape ? encodeFocus(withFocus(focus, editing, css)) : css);
  const { ref, handlers } = useCanvasDrag((x, y) => write(`${x}% ${y}%`));

  if (!image) {
    return <p className="text-[13px] text-[var(--admin-fg-muted,#7a8a90)]">{emptyHint}</p>;
  }
  const box = imgAspect ? coverBox(imgAspect, target.r, fx, fy) : null;
  return (
    <div className="rounded-2xl border border-[var(--admin-border,#e3e9ec)] bg-[var(--admin-card,#fff)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--admin-fg-muted,#7a8a90)]">{label}</span>
        <div className="flex items-center gap-3 shrink-0">
          {onCrop && (
            <button type="button" onClick={onCrop} className="text-[12px] font-bold text-[var(--admin-fg,#0a2a33)] hover:underline">Crop the photo…</button>
          )}
          <button type="button" onClick={() => onChange(null)} className="text-[12px] font-semibold text-[#c0392b] hover:underline">
            {perShape ? "Center all" : "Center"}
          </button>
        </div>
      </div>

      {/* Which shape you are framing. The dot marks the ones framed separately. */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {aspects.map((a, i) => {
          const separate = perShape && !!a.shape && hasOwnFocus(focus, a.shape);
          return (
            <button key={a.label} type="button" onClick={() => setShape(i)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-bold transition-colors ${
                i === shape
                  ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"
                  : "text-[var(--admin-fg-muted,#7a8a90)] border border-[var(--admin-border,#e3e9ec)] hover:text-[var(--admin-fg,#0a2a33)]"
              }`}>
              {a.label}
              {perShape && a.shape !== "desktop" && (
                <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${separate ? "bg-current" : "bg-current opacity-25"}`} />
              )}
            </button>
          );
        })}
      </div>

      {perShape && (
        <div className="flex items-start justify-between gap-3 mb-3 text-[11.5px] leading-snug">
          <span className="text-[var(--admin-fg-muted,#7a8a90)]">
            {editing === "desktop"
              ? "Desktop sets the framing every other shape follows."
              : own
                ? `${target.label} is framed separately.`
                : `${target.label} follows desktop — drag to frame it on its own.`}
          </span>
          {editing !== "desktop" && own && (
            <button type="button" onClick={() => write(null)} className="shrink-0 font-semibold text-[#c0392b] hover:underline">Follow desktop</button>
          )}
        </div>
      )}

      {/* The canvas shows the FULL image, static — the old cover-cropped canvas
          panned underneath the pointer while dragging (its background-position
          was the value being edited), so the dot drifted away from the feature
          you aimed at. Point at the pixel; the lit rectangle is what survives. */}
      <div ref={ref} {...handlers}
        className="relative w-full rounded-xl overflow-hidden cursor-crosshair select-none touch-none ring-1 ring-black/5 bg-[#0b0b0c]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" draggable={false} className="block w-full h-auto pointer-events-none select-none"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth && el.naturalHeight) setImgAspect(el.naturalWidth / el.naturalHeight);
          }} />
        {/* everything outside the crop is dimmed by the ring-shadow, clipped by the parent */}
        {box && (
          <span aria-hidden className="pointer-events-none absolute border-2 border-white/95"
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.w}%`, height: `${box.h}%`,
                     boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
        )}
        <span aria-hidden className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
          style={{ left: `${fx}%`, top: `${fy}%`, background: "rgba(0,175,219,0.3)" }} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {aspects.map((a, i) => {
          const separate = perShape && !!a.shape && hasOwnFocus(focus, a.shape);
          return (
            <button key={a.label} type="button" onClick={() => setShape(i)} className="text-left">
              <div className="w-full rounded-lg overflow-hidden bg-cover ring-1 transition-all"
                style={{ aspectRatio: String(a.r), backgroundImage: `url('${image}')`,
                         backgroundPosition: focusOf(focus, a.shape ?? "desktop") ?? "center",
                         ...(i === shape ? { boxShadow: "0 0 0 2px var(--admin-accent)" } : {}) }} />
              <p className="text-[11px] text-[var(--admin-fg-muted,#7a8a90)] mt-1">
                <span className="font-bold text-[var(--admin-fg,#0a2a33)]">{a.label}</span>
                {perShape && a.shape !== "desktop" ? (separate ? " · own framing" : " · follows desktop") : a.note ? ` · ${a.note}` : ""}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.round(v))); }

export { TILE_PLACEMENT_DEFAULTS };
