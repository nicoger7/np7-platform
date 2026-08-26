"use client";

/**
 * Promo Studio — direct-manipulation editor for NP7 promo graphics.
 *
 * Photoshop-style: everything is edited ON the artboard — click to select,
 * drag to move, handles to resize (corners = uniform, edges = X/Y stretch),
 * double-click a text to edit it in place, wheel to zoom the photo. The only
 * chrome is a top bar (format, prefill, save, export) and a floating context
 * pill next to the selection for the non-spatial knobs (opacity, fades,
 * rotation, swap image, hide).
 *
 * Rendering happens in ONE Canvas2D pass (src/lib/promo-render.ts) shared
 * with the PNG export, so the preview is pixel-identical to the download.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import {
  PROMO_FORMATS,
  PROMO_FLAGS,
  TEXT_KIND_LABELS,
  defaultPromoState,
  type PromoFormat,
  type PromoState,
} from "@/lib/promo-template";
import {
  drawPromo,
  getCachedImage,
  loadPromoImage,
  promoImageSources,
  type HitBox,
  type PromoFonts,
} from "@/lib/promo-render";
import { flagFromLocation, placeFromLocation } from "@/lib/experience-tile";

type Coach = { id: string; name: string; cutout_url: string | null };
type EditionRow = {
  id: string;
  label: string | null;
  year: number;
  date_start: string | null;
  date_end: string | null;
  location: string | null;
  price: number | null;
  currency: string | null;
  max_spots: number | null;
  hero_image: string | null;
  exp_experiences?: { title: string; location: string | null; hero_image: string | null } | null;
};
type DesignRow = { id: string; name: string; format: string; state: PromoState; updated_at: string };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function handlesFor(id: string, isText: boolean): string[] {
  if (isText) return ["nw", "ne", "sw", "se"];
  if (id === "flag" || id === "coach" || id === "logo") return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  return [];
}

function Mini({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1">
      <span className="opacity-70">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-16 accent-[#00afdb]" />
      <span className="w-7 text-right tabular-nums">{value}</span>
    </label>
  );
}

// -- date helper: "10–16 October 2026" / "28 Sep – 3 Oct 2026" ---------------
function dateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : s;
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long" });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
    return `${s.getDate()}–${e.getDate()} ${month(s)} ${s.getFullYear()}`;
  const short = (d: Date) => `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
  return `${short(s)} – ${short(e)} ${e.getFullYear()}`;
}

const CURRENCY: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

// =============================================================================

export default function PromoStudio() {
  const [state, setState] = useState<PromoState>(defaultPromoState);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [scale, setScale] = useState(0.5);
  const [, setImgTick] = useState(0); // bumps when an image finishes loading
  const [picker, setPicker] = useState<null | "photo" | "coach" | "logo">(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [editions, setEditions] = useState<EditionRow[]>([]);
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [designId, setDesignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "elements" | "edition" | "designs">(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const hitsRef = useRef<HitBox[]>([]);
  const fontsRef = useRef<PromoFonts>({ anton: "Anton", poppins: "Poppins" });
  const stateRef = useRef(state);
  stateRef.current = state;

  const fmt = state.format;
  const { w: W, h: H } = PROMO_FORMATS[fmt];

  // -- fonts: resolve the next/font family names, preload the weights we draw
  useEffect(() => {
    const css = getComputedStyle(document.body);
    const anton = css.getPropertyValue("--font-display").trim() || "Anton";
    const poppins = css.getPropertyValue("--font-inter").trim() || "Poppins";
    fontsRef.current = { anton, poppins };
    const first = (list: string) => list.split(",")[0].trim();
    const loads = [
      `400 100px ${first(anton)}`,
      ...["500", "600", "700", "800"].map((w) => `${w} 100px ${first(poppins)}`),
      `italic 500 100px ${first(poppins)}`,
    ].map((f) => document.fonts.load(f).catch(() => []));
    Promise.all(loads).then(() => setImgTick((t) => t + 1));
  }, []);

  // -- image preload
  useEffect(() => {
    let alive = true;
    for (const src of promoImageSources(state)) {
      if (!getCachedImage(src))
        loadPromoImage(src)
          .then(() => alive && setImgTick((t) => t + 1))
          .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [state]);

  // -- fit scale
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const pad = 24;
      const s = Math.min((el.clientWidth - pad) / W, (el.clientHeight - pad) / H, 1);
      setScale(Math.max(0.1, s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // -- draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    hitsRef.current = drawPromo(ctx, state, fontsRef.current, { skipTextId: editingText });
  });

  // -- data fetches (lazy)
  const loadCoaches = useCallback(() => {
    if (coaches.length) return;
    fetch("/api/admin/coaches")
      .then((r) => r.json())
      .then((d) => setCoaches(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [coaches.length]);

  const loadEditions = useCallback(() => {
    if (editions.length) return;
    fetch("/api/admin/editions")
      .then((r) => r.json())
      .then((d) => setEditions(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [editions.length]);

  const loadDesigns = useCallback(() => {
    fetch("/api/admin/promo/designs")
      .then((r) => r.json())
      .then((d) => setDesigns(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCoaches();
    loadDesigns();
  }, [loadCoaches, loadDesigns]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // -- state helpers ----------------------------------------------------------
  const patch = useCallback((fn: (s: PromoState) => PromoState) => {
    setState((s) => fn(structuredClone(s)));
  }, []);

  const patchText = (id: string, fn: (t: PromoState["texts"][number]) => void) =>
    patch((s) => {
      const t = s.texts.find((x) => x.id === id);
      if (t) fn(t);
      return s;
    });

  const setHidden = (id: string, visible: boolean) =>
    patch((s) => {
      if (id === "photo") return s;
      if (id === "flag") s.flag.visible = visible;
      else if (id === "coach") s.coach.visible = visible;
      else if (id === "logo") s.logo.visible = visible;
      else {
        const t = s.texts.find((x) => x.id === id);
        if (t) t.visible = visible;
      }
      return s;
    });

  // -- edition prefill --------------------------------------------------------
  const applyEdition = async (ed: EditionRow) => {
    const exp = ed.exp_experiences;
    const location = ed.location || exp?.location || "";
    const place = placeFromLocation(location) || exp?.title || "";
    const words = place.split(/\s+/);
    const placeText = words.length >= 2 ? `${words[0]}\n${words.slice(1).join(" ")}` : place;
    const dates = dateRange(ed.date_start, ed.date_end);
    const sym = CURRENCY[ed.currency || ""] ?? "€";
    const flag = flagFromLocation(location);
    let coach: Coach | null = null;
    try {
      const links = await fetch(`/api/admin/editions/${ed.id}/coaches`).then((r) => r.json());
      const withCutout = (Array.isArray(links) ? links : [])
        .map((l: { exp_coaches?: Coach } & Coach) => l.exp_coaches ?? l)
        .find((c: Coach) => c?.cutout_url);
      coach = withCutout ?? null;
    } catch {
      /* keep current coach */
    }
    patch((s) => {
      const photo = ed.hero_image || exp?.hero_image;
      if (photo) s.photo.src = photo;
      s.flag.src = flag ? `/flags/${flag.code}.svg` : s.flag.src;
      if (coach?.cutout_url) {
        s.coach.src = coach.cutout_url;
        const wt = s.texts.find((t) => t.id === "with");
        if (wt) wt.text = coach.name;
      }
      const set = (id: string, text: string | null) => {
        const t = s.texts.find((x) => x.id === id);
        if (t && text) t.text = text;
      };
      set("place", placeText);
      set("chip-gold", dates);
      set("chip-glass", location);
      set("subtitle", ed.label || exp?.title || null);
      const price = ed.price;
      set(
        "details",
        `${ed.max_spots ? `*${ed.max_spots} spots*` : "*Small group*"}${price ? ` · from *${sym}${price}*` : ""} · coaching all week`
      );
      s.name = ed.label || `${exp?.title ?? "Promo"} ${ed.year}`;
      return s;
    });
    setMenu(null);
  };

  // -- save / load ------------------------------------------------------------
  const save = async () => {
    setSaving(true);
    try {
      const body = JSON.stringify({ name: state.name, format: state.format, state });
      const res = designId
        ? await fetch(`/api/admin/promo/designs/${designId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/admin/promo/designs", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "save failed");
      setDesignId(data.id ?? designId);
      loadDesigns();
      flash("Saved ✓");
    } catch (e) {
      flash(`Save failed: ${e instanceof Error ? e.message : e} — is migration 186 applied?`);
    } finally {
      setSaving(false);
    }
  };

  const loadDesign = (d: DesignRow) => {
    setState(d.state);
    setDesignId(d.id);
    setSelected(null);
    setMenu(null);
  };

  // -- export -----------------------------------------------------------------
  const exportPng = async (which: PromoFormat[]) => {
    const slug = state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "promo";
    for (const f of which) {
      const s: PromoState = { ...stateRef.current, format: f };
      await Promise.all(promoImageSources(s).map((src) => loadPromoImage(src).catch(() => null)));
      const { w, h } = PROMO_FORMATS[f];
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      drawPromo(off.getContext("2d")!, s, fontsRef.current);
      const blob = await new Promise<Blob | null>((res) => off.toBlob(res, "image/png"));
      if (!blob) continue;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-${f === "45" ? "4x5" : "9x16"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  // -- pointer interaction ----------------------------------------------------
  const dragRef = useRef<null | {
    mode: "move" | "resize";
    handle?: string;
    id: string;
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number; size?: number; fx?: number; fy?: number };
  }>(null);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const selectedBox = (): { x: number; y: number; w: number; h: number } | null => {
    const hb = hitsRef.current.find((h) => h.id === selected);
    return hb ? hb.box : null;
  };

  const beginDrag = (e: React.PointerEvent, mode: "move" | "resize", id: string, handle?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const p = toCanvas(e);
    const s = stateRef.current;
    const orig: { x: number; y: number; w: number; h: number; size?: number; fx?: number; fy?: number } =
      { x: 0, y: 0, w: 0, h: 0 };
    if (id === "photo") {
      orig.fx = s.photo.focal[s.format].x;
      orig.fy = s.photo.focal[s.format].y;
    } else if (id === "flag" || id === "coach" || id === "logo") {
      const b = (id === "flag" ? s.flag : id === "coach" ? s.coach : s.logo).box[s.format];
      Object.assign(orig, b);
    } else {
      const t = s.texts.find((x) => x.id === id);
      const hb = hitsRef.current.find((h) => h.id === id);
      if (t && hb) Object.assign(orig, hb.box, { size: t.size, x: t.pos[s.format].x, y: t.pos[s.format].y, w: hb.box.w, h: hb.box.h });
    }
    dragRef.current = { mode, handle, id, startX: p.x, startY: p.y, orig };

    const move = (ev: PointerEvent) => onDrag(ev);
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onDrag = (ev: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toCanvas(ev);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const f = stateRef.current.format;
    patch((s) => {
      if (d.id === "photo") {
        const img = getCachedImage(s.photo.src);
        if (!img) return s;
        const fo = s.photo.focal[f];
        const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight) * (fo.zoom / 100);
        const dw = img.naturalWidth * sc;
        const dh = img.naturalHeight * sc;
        if (dw > W + 1) fo.x = clamp((d.orig.fx ?? 50) + (dx * 100) / (W - dw), 0, 100);
        if (dh > H + 1) fo.y = clamp((d.orig.fy ?? 50) + (dy * 100) / (H - dh), 0, 100);
        return s;
      }
      if (d.id === "flag" || d.id === "coach" || d.id === "logo") {
        const layer = d.id === "flag" ? s.flag : d.id === "coach" ? s.coach : s.logo;
        const b = layer.box[f];
        if (d.mode === "move") {
          b.x = Math.round(d.orig.x + dx);
          b.y = Math.round(d.orig.y + dy);
        } else {
          resizeBox(b, d.orig, d.handle!, dx, dy);
        }
        return s;
      }
      const t = s.texts.find((x) => x.id === d.id);
      if (!t) return s;
      if (d.mode === "move") {
        t.pos[f].x = Math.round(d.orig.x + dx);
        t.pos[f].y = Math.round(d.orig.y + dy);
      } else {
        // corner drag scales the font size proportionally to the width change
        const sign = d.handle?.includes("w") ? -1 : 1;
        const ratio = clamp((d.orig.w + sign * dx) / Math.max(1, d.orig.w), 0.2, 6);
        t.size = clamp(Math.round((d.orig.size ?? t.size) * ratio), 9, 420);
      }
      return s;
    });
  };

  const resizeBox = (
    b: { x: number; y: number; w: number; h: number },
    o: { x: number; y: number; w: number; h: number },
    handle: string,
    dx: number,
    dy: number
  ) => {
    const corner = handle.length === 2;
    let { x, y, w, h } = o;
    if (corner) {
      // uniform scale anchored at the opposite corner
      const sx = handle.includes("w") ? -1 : 1;
      const ratio = clamp((o.w + sx * dx) / Math.max(1, o.w), 0.05, 20);
      w = o.w * ratio;
      h = o.h * ratio;
      if (handle.includes("w")) x = o.x + o.w - w;
      if (handle.includes("n")) y = o.y + o.h - h;
    } else {
      // edge = free stretch on ONE axis
      if (handle === "e") w = o.w + dx;
      if (handle === "w") {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (handle === "s") h = o.h + dy;
      if (handle === "n") {
        h = o.h - dy;
        y = o.y + dy;
      }
    }
    b.x = Math.round(x);
    b.y = Math.round(y);
    b.w = Math.round(Math.max(12, w));
    b.h = Math.round(Math.max(12, h));
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (editingText) return;
    const p = toCanvas(e);
    // topmost hit wins (hits are bottom-first)
    const hit = [...hitsRef.current]
      .reverse()
      .find((h) => p.x >= h.box.x && p.x <= h.box.x + h.box.w && p.y >= h.box.y && p.y <= h.box.y + h.box.h);
    const id = hit?.id ?? null;
    setSelected(id);
    setMenu(null);
    if (id) beginDrag(e, "move", id);
  };

  // wheel zoom needs a NON-passive native listener (React's root wheel
  // listener is passive, so preventDefault there is a no-op)
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (selectedRef.current !== "photo") return;
      e.preventDefault();
      patch((s) => {
        const fo = s.photo.focal[s.format];
        fo.zoom = clamp(Math.round(fo.zoom - e.deltaY * 0.05), 100, 260);
        return s;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [patch]);

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toCanvas(e);
    const hit = [...hitsRef.current]
      .reverse()
      .find((h) => p.x >= h.box.x && p.x <= h.box.x + h.box.w && p.y >= h.box.y && p.y <= h.box.y + h.box.h);
    if (hit && stateRef.current.texts.some((t) => t.id === hit.id)) {
      setSelected(hit.id);
      setEditingText(hit.id);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editingText || !selected) return;
    const step = e.shiftKey ? 10 : 1;
    const nudge = (dx: number, dy: number) => {
      patch((s) => {
        const f = s.format;
        if (selected === "flag" || selected === "coach" || selected === "logo") {
          const b = (selected === "flag" ? s.flag : selected === "coach" ? s.coach : s.logo).box[f];
          b.x += dx;
          b.y += dy;
        } else if (selected !== "photo") {
          const t = s.texts.find((x) => x.id === selected);
          if (t) {
            t.pos[f].x += dx;
            t.pos[f].y += dy;
          }
        }
        return s;
      });
    };
    if (e.key === "Delete" || e.key === "Backspace") {
      setHidden(selected, false);
      setSelected(null);
    } else if (e.key === "Escape") setSelected(null);
    else if (e.key === "ArrowLeft") nudge(-step, 0);
    else if (e.key === "ArrowRight") nudge(step, 0);
    else if (e.key === "ArrowUp") nudge(0, -step);
    else if (e.key === "ArrowDown") nudge(0, step);
    else return;
    e.preventDefault();
  };

  // -- inline text editing ----------------------------------------------------
  const editingLayer = state.texts.find((t) => t.id === editingText) ?? null;
  const editBox = editingText ? hitsRef.current.find((h) => h.id === editingText)?.box : null;

  const commitText = (value: string) => {
    if (editingText) patchText(editingText, (t) => (t.text = value.replace(/\r/g, "")));
    setEditingText(null);
  };

  // -- hidden elements (for the restore menu) ---------------------------------
  const hiddenElements = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    if (!state.flag.visible) out.push({ id: "flag", label: "Flag" });
    if (!state.coach.visible) out.push({ id: "coach", label: "Coach" });
    if (!state.logo.visible) out.push({ id: "logo", label: "Logo" });
    for (const t of state.texts) if (!t.visible) out.push({ id: t.id, label: TEXT_KIND_LABELS[t.kind] });
    return out;
  }, [state]);

  const box = selectedBox();
  const sel = selected;
  const selText = state.texts.find((t) => t.id === sel) ?? null;

  // ===========================================================================

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[560px]" onKeyDown={onKeyDown} tabIndex={0}>
      {/* ── top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <input
          value={state.name}
          onChange={(e) => patch((s) => ((s.name = e.target.value), s))}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold w-52"
          style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
        />
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border,#ddd)" }}>
          {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => patch((s) => ((s.format = f), s))}
              className="px-3 py-1.5 text-xs font-bold"
              style={{
                background: fmt === f ? "var(--admin-accent,#00afdb)" : "var(--admin-surface,#fff)",
                color: fmt === f ? "#fff" : "var(--admin-text,#111)",
              }}
            >
              {PROMO_FORMATS[f].label}
            </button>
          ))}
        </div>

        {(["edition", "elements", "designs"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMenu(menu === m ? null : m);
              if (m === "edition") loadEditions();
              if (m === "designs") loadDesigns();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
          >
            {m === "edition" ? "From edition ▾" : m === "elements" ? "Elements ▾" : "Designs ▾"}
          </button>
        ))}

        <div className="flex-1" />
        {notice && <span className="text-xs font-semibold" style={{ color: "var(--admin-text-muted,#666)" }}>{notice}</span>}
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: "var(--admin-accent,#00afdb)" }}>
          {saving ? "Saving…" : designId ? "Save" : "Save as new"}
        </button>
        <button onClick={() => exportPng([fmt])} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0a2a33]">
          Export PNG
        </button>
        <button onClick={() => exportPng(["45", "916"])} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0a2a33]">
          Export both
        </button>
      </div>

      {/* ── dropdown menus ──────────────────────────────────────────────── */}
      {menu && (
        <div
          className="mb-3 p-3 rounded-xl text-sm max-h-64 overflow-y-auto"
          style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
        >
          {menu === "edition" &&
            (editions.length ? (
              <div className="flex flex-col gap-1">
                {editions.map((ed) => (
                  <button key={ed.id} onClick={() => applyEdition(ed)} className="text-left px-2 py-1 rounded hover:bg-black/5">
                    <b>{ed.label || ed.exp_experiences?.title}</b>{" "}
                    <span style={{ color: "var(--admin-text-muted,#666)" }}>
                      {ed.year} · {ed.location || ed.exp_experiences?.location}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <span style={{ color: "var(--admin-text-muted,#666)" }}>Loading editions…</span>
            ))}
          {menu === "elements" && (
            <div className="flex flex-wrap gap-3">
              {[
                { id: "flag", label: "Flag", vis: state.flag.visible },
                { id: "coach", label: "Coach", vis: state.coach.visible },
                { id: "logo", label: "Logo", vis: state.logo.visible },
                ...state.texts.map((t) => ({ id: t.id, label: TEXT_KIND_LABELS[t.kind], vis: t.visible })),
              ].map((el) => (
                <label key={el.id} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={el.vis} onChange={(e) => setHidden(el.id, e.target.checked)} />
                  {el.label}
                </label>
              ))}
              <span className="w-px self-stretch" style={{ background: "var(--admin-border,#ddd)" }} />
              {(
                [
                  ["softlight", "Sun-to-sea wash"],
                  ["veil", "Colour veil"],
                  ["darkenLeft", "Left darken"],
                  ["darkenBottom", "Bottom darken"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.washes[k]}
                    onChange={(e) => patch((s) => ((s.washes[k] = e.target.checked), s))}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          {menu === "designs" && (
              <div className="flex flex-col gap-1">
                {designs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <button onClick={() => loadDesign(d)} className="flex-1 text-left px-2 py-1 rounded hover:bg-black/5">
                      <b>{d.name}</b>{" "}
                      <span style={{ color: "var(--admin-text-muted,#666)" }}>{new Date(d.updated_at).toLocaleDateString()}</span>
                    </button>
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/promo/designs/${d.id}`, { method: "DELETE" });
                        if (designId === d.id) setDesignId(null);
                        loadDesigns();
                      }}
                      className="text-xs px-2 py-1 rounded hover:bg-black/5"
                      style={{ color: "var(--admin-text-muted,#666)" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {!designs.length && (
                  <span style={{ color: "var(--admin-text-muted,#666)" }}>No saved designs yet.</span>
                )}
                <button
                  onClick={() => {
                    setState(defaultPromoState());
                    setDesignId(null);
                    setMenu(null);
                  }}
                  className="text-left px-2 py-1 rounded hover:bg-black/5 font-bold"
                >
                  + New from template
                </button>
              </div>
            )}
        </div>
      )}

      {/* ── artboard ────────────────────────────────────────────────────── */}
      <div ref={fitRef} className="flex-1 min-h-0 flex items-center justify-center rounded-xl" style={{ background: "var(--admin-bg,#eef1f4)" }}>
        <div
          ref={wrapRef}
          className="relative select-none touch-none"
          style={{ width: W * scale, height: H * scale, cursor: dragRef.current ? "grabbing" : "default" }}
          onPointerDown={onCanvasPointerDown}
          onDoubleClick={onDoubleClick}
        >
          <canvas ref={canvasRef} style={{ width: W * scale, height: H * scale, borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }} />

          {/* selection outline + handles */}
          {box && sel && !editingText && (
            <>
              <div
                className="absolute pointer-events-none"
                style={{
                  left: box.x * scale - 1,
                  top: box.y * scale - 1,
                  width: box.w * scale + 2,
                  height: box.h * scale + 2,
                  border: "1.5px solid #00afdb",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
                }}
              />
              {sel !== "photo" &&
                handlesFor(sel, selText != null).map((hd) => (
                  <div
                    key={hd}
                    onPointerDown={(e) => beginDrag(e, "resize", sel, hd)}
                    className="absolute w-3 h-3 rounded-[3px] bg-white"
                    style={{
                      border: "1.5px solid #00afdb",
                      cursor: `${hd}-resize`,
                      left: box.x * scale + (hd.includes("w") ? -6 : hd.includes("e") ? box.w * scale - 6 : box.w * scale / 2 - 6),
                      top: box.y * scale + (hd.includes("n") ? -6 : hd.includes("s") ? box.h * scale - 6 : box.h * scale / 2 - 6),
                    }}
                  />
                ))}
            </>
          )}

          {/* inline text editor */}
          {editingLayer && editBox && (
            <textarea
              autoFocus
              defaultValue={editingLayer.text}
              onBlur={(e) => commitText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingText(null);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitText((e.target as HTMLTextAreaElement).value);
                e.stopPropagation();
              }}
              className="absolute resize-none outline-none rounded"
              style={{
                left: editBox.x * scale - 4,
                top: editBox.y * scale - 4,
                width: Math.max(220, editBox.w * scale + 80),
                height: Math.max(44, editBox.h * scale + 24),
                background: "rgba(0,20,28,0.85)",
                color: "#fff",
                border: "1.5px solid #00afdb",
                font: `600 ${Math.max(13, Math.min(26, editingLayer.size * scale))}px var(--font-inter, Poppins, sans-serif)`,
                padding: 4,
                lineHeight: 1.2,
              }}
            />
          )}

          {/* floating context pill */}
          {sel && box && !editingText && (
            <div
              className="absolute z-20 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white flex-wrap"
              style={{
                left: clamp(box.x * scale, 4, Math.max(4, W * scale - 340)),
                top: clamp(box.y * scale - 44, 4, H * scale - 40),
                background: "rgba(8,20,26,0.92)",
                maxWidth: 400,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {sel === "photo" && (
                <>
                  <button onClick={() => setPicker("photo")} className="underline">replace</button>
                  <Mini label="zoom" min={100} max={260} value={state.photo.focal[fmt].zoom} onChange={(v) => patch((s) => ((s.photo.focal[s.format].zoom = v), s))} />
                  <span className="opacity-60">drag = focus · wheel = zoom</span>
                </>
              )}
              {sel === "flag" && (
                <>
                  <select
                    value={state.flag.src ?? ""}
                    onChange={(e) => patch((s) => ((s.flag.src = e.target.value || null), s))}
                    className="bg-transparent border border-white/30 rounded px-1 py-0.5"
                  >
                    {PROMO_FLAGS.map((f) => (
                      <option key={f.code} value={`/flags/${f.code}.svg`} className="text-black">{f.name}</option>
                    ))}
                  </select>
                  <Mini label="opacity" min={5} max={100} value={Math.round(state.flag.opacity * 100)} onChange={(v) => patch((s) => ((s.flag.opacity = v / 100), s))} />
                  <Mini label="rotate" min={-45} max={45} value={state.flag.rotate} onChange={(v) => patch((s) => ((s.flag.rotate = v), s))} />
                  <Mini label="fade" min={0} max={60} value={state.flag.fadeSide} onChange={(v) => patch((s) => ((s.flag.fadeSide = v), s))} />
                  <Mini label="fade ↓" min={5} max={90} value={state.flag.fadeDown[fmt]} onChange={(v) => patch((s) => ((s.flag.fadeDown[s.format] = v), s))} />
                  <button
                    onClick={() => patch((s) => ((s.flag.blend = s.flag.blend === "screen" ? "normal" : "screen"), s))}
                    className="underline"
                  >
                    {state.flag.blend}
                  </button>
                </>
              )}
              {sel === "coach" && (
                <>
                  <select
                    value={state.coach.src ?? ""}
                    onChange={(e) => {
                      const url = e.target.value;
                      if (url === "__custom") setPicker("coach");
                      else
                        patch((s) => {
                          s.coach.src = url || null;
                          const c = coaches.find((x) => x.cutout_url === url);
                          const wt = s.texts.find((t) => t.id === "with");
                          if (c && wt) wt.text = c.name;
                          return s;
                        });
                    }}
                    className="bg-transparent border border-white/30 rounded px-1 py-0.5 max-w-40"
                  >
                    <option value="" className="text-black">— coach —</option>
                    {coaches.filter((c) => c.cutout_url).map((c) => (
                      <option key={c.id} value={c.cutout_url!} className="text-black">{c.name}</option>
                    ))}
                    <option value="__custom" className="text-black">Custom image…</option>
                  </select>
                  <button
                    onClick={() =>
                      patch((s) => {
                        const img = getCachedImage(s.coach.src);
                        if (img) {
                          const b = s.coach.box[s.format];
                          b.h = Math.round((b.w * img.naturalHeight) / img.naturalWidth);
                        }
                        return s;
                      })
                    }
                    className="underline"
                  >
                    fix ratio
                  </button>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!!state.coach.shadow} onChange={(e) => patch((s) => ((s.coach.shadow = e.target.checked), s))} />
                    shadow
                  </label>
                </>
              )}
              {sel === "logo" && <button onClick={() => setPicker("logo")} className="underline">replace</button>}
              {selText && (
                <>
                  <button onClick={() => setEditingText(sel)} className="underline">edit text</button>
                  <Mini label="size" min={9} max={selText.kind === "place" ? 420 : 90} value={selText.size} onChange={(v) => patchText(sel!, (t) => (t.size = v))} />
                </>
              )}
              <button
                onClick={() => {
                  setHidden(sel, false);
                  setSelected(null);
                }}
                title="Hide (restore via Elements menu)"
                className="ml-1 opacity-80 hover:opacity-100"
              >
                🚫
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="pt-2 text-[11px]" style={{ color: "var(--admin-text-muted,#666)" }}>
        Click = select · drag = move · corners = size · edges = stretch X/Y · double-click text = edit · ⌫ = hide · arrows = nudge · *stars* = gold accent in the details/partner lines
      </p>

      {/* image picker */}
      {picker && (
        <ImagePickerModal
          defaultFolder={picker === "coach" ? "experiences/shared" : undefined}
          onSelect={(url) => {
            patch((s) => {
              if (picker === "photo") s.photo.src = url;
              if (picker === "coach") s.coach.src = url;
              if (picker === "logo") s.logo.src = url;
              return s;
            });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );

}
