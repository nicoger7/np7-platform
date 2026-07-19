"use client";

import { useRef, useState } from "react";
import { BrandedTile } from "@/components/experience/branded-tile";
import { resolveTilePlacement, TILE_PLACEMENT_DEFAULTS, type FlagInfo, type TilePlacement } from "@/lib/experience-tile";

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
type TileContent = { photo: string | null; place: string; flag: FlagInfo | null; coachName: string | null; coachCutout: string | null };

// The real tile is fixed-height / fluid-width: aspect ~1.3 (2-col) → ~2.8 (wide
// 1-col). We preview the extremes so placement is safe on every screen.
const PREVIEW_ASPECTS = [
  { r: 1.35, label: "Narrow column", note: "tablet / 2-up" },
  { r: 1.73, label: "Standard", note: "desktop 3-up" },
  { r: 2.7, label: "Wide", note: "phone 1-up" },
];

type Elem = "photo" | "coach" | "flag";

export function TilePlacementEditor({ content, value, onChange }: {
  content: TileContent; value: TilePlacement; onChange: (v: TilePlacement) => void;
}) {
  const [active, setActive] = useState<Elem>("photo");
  const p = resolveTilePlacement(value);
  const set = (patch: Partial<TilePlacement>) => onChange({ ...value, ...patch });

  // Drag on the canvas moves whichever element is active.
  const { ref, handlers } = useCanvasDrag((x, y) => {
    if (active === "photo") set({ photoX: x, photoY: y });
    else if (active === "coach") set({ coachRight: clamp(100 - x, -15, 85), coachBottom: clamp(100 - y, -15, 60) });
    else set({ flagRight: clamp(100 - x, -20, 70), flagTop: clamp(y - 60, -40, 35) });
  });

  // Marker position (canvas %) for the active element.
  const marker = active === "photo" ? { x: p.photoX, y: p.photoY }
    : active === "coach" ? { x: 100 - p.coachRight, y: 100 - p.coachBottom }
    : { x: 100 - p.flagRight, y: p.flagTop + 60 };

  const hasCoach = !!content.coachName;
  const hasFlag = !!content.flag;

  return (
    <div className="rounded-2xl border border-[var(--admin-border,#e3e9ec)] bg-[var(--admin-card,#fff)] p-4 sm:p-5">
      {/* element picker */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--admin-fg-muted,#7a8a90)] mr-1">Adjust</span>
        {([["photo", "Photo crop"], ["coach", "Coach"], ["flag", "Flag"]] as [Elem, string][]).map(([k, lbl]) => {
          const disabled = (k === "coach" && !hasCoach) || (k === "flag" && !hasFlag);
          return (
            <button key={k} type="button" disabled={disabled} onClick={() => setActive(k)}
              className={`text-[13px] font-bold px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                active === k ? "bg-[#00374a] text-white" : "bg-[var(--admin-chip,#eef3f5)] text-[var(--admin-fg,#0a2a33)] hover:bg-[#dfe8eb]"
              }`}>{lbl}</button>
          );
        })}
        <button type="button" onClick={() => onChange({})}
          className="ml-auto text-[12px] font-semibold text-[#c0392b] hover:underline">Reset to default</button>
      </div>

      {/* editor canvas — drag to place the active element */}
      <div ref={ref} {...handlers}
        className="group relative w-full rounded-xl overflow-hidden cursor-crosshair select-none touch-none ring-1 ring-black/5"
        style={{ aspectRatio: "1.73" }}>
        <BrandedTile photo={content.photo} place={content.place} flag={content.flag}
          coachName={content.coachName} coachCutout={content.coachCutout} placement={value} />
        {/* active-element marker */}
        <span aria-hidden className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
          style={{ left: `${marker.x}%`, top: `${marker.y}%`, background: "rgba(0,175,219,0.35)" }} />
        <span className="pointer-events-none absolute top-2 left-2 z-20 text-[10px] font-bold uppercase tracking-[0.1em] text-white/90 bg-black/45 rounded px-2 py-0.5">
          Drag to move the {active}
        </span>
      </div>

      {/* per-element sliders */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {active === "photo" && (
          <>
            <Slider label="Horizontal" value={p.photoX} min={0} max={100} suffix="%" onChange={(v) => set({ photoX: v })} />
            <Slider label="Vertical" value={p.photoY} min={0} max={100} suffix="%" onChange={(v) => set({ photoY: v })} />
          </>
        )}
        {active === "coach" && hasCoach && (
          <>
            <Slider label="Size" value={p.coachScale} min={45} max={120} suffix="%" onChange={(v) => set({ coachScale: v })} />
            <Slider label="From right" value={p.coachRight} min={-15} max={60} suffix="%" onChange={(v) => set({ coachRight: v })} />
            <Slider label="From bottom" value={p.coachBottom} min={-15} max={50} suffix="%" onChange={(v) => set({ coachBottom: v })} />
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

      {/* multi-aspect preview — the same tile at the narrowest & widest shapes it
          can take on the live site, so placement is safe on every screen */}
      <div className="mt-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--admin-fg-muted,#7a8a90)] mb-2">How it looks on every screen</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PREVIEW_ASPECTS.map((a) => (
            <div key={a.label}>
              <div className="group relative w-full rounded-lg overflow-hidden ring-1 ring-black/5" style={{ aspectRatio: String(a.r) }}>
                <BrandedTile photo={content.photo} place={content.place} flag={content.flag}
                  coachName={content.coachName} coachCutout={content.coachCutout} placement={value} />
              </div>
              <p className="text-[11px] text-[var(--admin-fg-muted,#7a8a90)] mt-1"><span className="font-bold text-[var(--admin-fg,#0a2a33)]">{a.label}</span> · {a.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HERO focal-point picker — drag to choose the crop centre; previews at the
   widest (desktop) and tallest (phone) shapes the hero takes.
════════════════════════════════════════════════════════════════════════════ */
const HERO_ASPECTS = [
  { r: 2.4, label: "Desktop", note: "wide banner" },
  { r: 1.5, label: "Tablet", note: "" },
  { r: 0.72, label: "Phone", note: "tall" },
];

/** hero_focus is a CSS object-position string, e.g. "50% 40%" (null = center). */
export function HeroFocusPicker({ image, value, onChange }: {
  image: string | null; value: string | null; onChange: (v: string | null) => void;
}) {
  const [fx, fy] = parseFocus(value);
  const { ref, handlers } = useCanvasDrag((x, y) => onChange(`${x}% ${y}%`));
  if (!image) {
    return <p className="text-[13px] text-[var(--admin-fg-muted,#7a8a90)]">Upload a hero image above to set its focal point.</p>;
  }
  return (
    <div className="rounded-2xl border border-[var(--admin-border,#e3e9ec)] bg-[var(--admin-card,#fff)] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--admin-fg-muted,#7a8a90)]">Drag to set the focal point</span>
        <button type="button" onClick={() => onChange(null)} className="text-[12px] font-semibold text-[#c0392b] hover:underline">Center</button>
      </div>
      <div ref={ref} {...handlers}
        className="relative w-full rounded-xl overflow-hidden cursor-crosshair select-none touch-none bg-cover ring-1 ring-black/5"
        style={{ aspectRatio: "2.2", backgroundImage: `url('${image}')`, backgroundPosition: `${fx}% ${fy}%` }}>
        <span aria-hidden className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
          style={{ left: `${fx}%`, top: `${fy}%`, background: "rgba(0,175,219,0.3)" }} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {HERO_ASPECTS.map((a) => (
          <div key={a.label}>
            <div className="w-full rounded-lg overflow-hidden bg-cover ring-1 ring-black/5"
              style={{ aspectRatio: String(a.r), backgroundImage: `url('${image}')`, backgroundPosition: `${fx}% ${fy}%` }} />
            <p className="text-[11px] text-[var(--admin-fg-muted,#7a8a90)] mt-1"><span className="font-bold text-[var(--admin-fg,#0a2a33)]">{a.label}</span>{a.note ? ` · ${a.note}` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseFocus(v: string | null): [number, number] {
  if (!v) return [50, 50];
  const m = v.match(/(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.round(v))); }

export { TILE_PLACEMENT_DEFAULTS };
