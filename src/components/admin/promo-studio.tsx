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
import PromoGallery from "@/components/admin/promo-gallery";
import {
  GRADIENT_PRESETS,
  PROMO_FORMATS,
  PROMO_FLAGS,
  TEXT_KIND_LABELS,
  defaultPromoState,
  promoOrder,
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
  if (id === "flag" || id === "coach" || id === "logo" || id.startsWith("img-")) return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
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
  const [picker, setPicker] = useState<null | "photo" | "coach" | "logo" | "add" | "add-replace">(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [editions, setEditions] = useState<EditionRow[]>([]);
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [designId, setDesignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "elements" | "edition" | "designs" | "layers">(null);
  const [gallery, setGallery] = useState(false);

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

  // -- history (undo/redo) ----------------------------------------------------
  // Every mutation snapshots the previous state. Continuous gestures (drag,
  // slider scrub, wheel zoom) pass a stable key so the whole gesture collapses
  // into ONE undo step; discrete edits get a unique key and always snapshot.
  const pastRef = useRef<PromoState[]>([]);
  const futureRef = useRef<PromoState[]>([]);
  const lastKeyRef = useRef<{ key: string | null; t: number }>({ key: null, t: 0 });
  const keySeq = useRef(0);
  const [histTick, setHistTick] = useState(0);

  const patch = useCallback((fn: (s: PromoState) => PromoState, key?: string) => {
    setState((s) => {
      const now = Date.now();
      const k = key ?? `once-${++keySeq.current}`;
      const coalesce = lastKeyRef.current.key === k && now - lastKeyRef.current.t < 900;
      if (!coalesce) {
        pastRef.current.push(structuredClone(s));
        if (pastRef.current.length > 60) pastRef.current.shift();
        futureRef.current = [];
      }
      lastKeyRef.current = { key: k, t: now };
      return fn(structuredClone(s));
    });
    setHistTick((t) => t + 1);
  }, []);

  /** Replace the whole state (load design / reset / prefill) as one undo step. */
  const replaceState = useCallback((next: PromoState) => {
    setState((s) => {
      pastRef.current.push(structuredClone(s));
      if (pastRef.current.length > 60) pastRef.current.shift();
      futureRef.current = [];
      lastKeyRef.current = { key: null, t: 0 };
      return next;
    });
    setHistTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      const prev = pastRef.current.pop();
      if (!prev) return s;
      futureRef.current.push(structuredClone(s));
      lastKeyRef.current = { key: null, t: 0 };
      return prev;
    });
    setHistTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      const next = futureRef.current.pop();
      if (!next) return s;
      pastRef.current.push(structuredClone(s));
      lastKeyRef.current = { key: null, t: 0 };
      return next;
    });
    setHistTick((t) => t + 1);
  }, []);

  void histTick; // re-render trigger so the undo/redo buttons enable/disable

  // global ⌘Z / ⇧⌘Z (skipped while typing in an input/textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const patchText = (id: string, fn: (t: PromoState["texts"][number]) => void) =>
    patch((s) => {
      const t = s.texts.find((x) => x.id === id);
      if (t) fn(t);
      return s;
    });

  const setHidden = (id: string, visible: boolean) =>
    patch((s) => {
      if (id === "photo") return s;
      if (id === "gradient")
        // older designs may predate the gradient layer — create it on first use
        s.gradient = { ...(s.gradient ?? defaultPromoState().gradient!), visible };
      else if (id === "flag") s.flag.visible = visible;
      else if (id === "coach") s.coach.visible = visible;
      else if (id === "logo") s.logo.visible = visible;
      else if (id.startsWith("img-")) {
        const im = (s.images ?? []).find((i) => i.id === id);
        if (im) im.visible = visible;
      } else {
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
    // normalize designs saved before the gradient layer existed
    if (!d.state.gradient) d.state.gradient = { ...defaultPromoState().gradient!, visible: false };
    replaceState(d.state);
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
    key: string;
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number; size?: number; fx?: number; fy?: number };
  }>(null);

  /**
   * Which element is under the pointer — forgivingly.
   *
   * Hit boxes are in DESIGN pixels, so at the ~37% zoom the artboard fits at,
   * the details line's 33px box is twelve pixels tall on screen and sits
   * fourteen from the partner line. Both were effectively untappable: correct
   * geometry, unusable target.
   *
   * So a near-miss counts. Exact hits still win outright and the topmost of
   * those wins, which keeps precise clicking exact; only when nothing is hit
   * squarely do we look at boxes grown to a sane on-screen size, and then the
   * one whose centre is nearest the pointer wins — so two stacked thin lines
   * resolve to the one actually aimed at.
   */
  const MIN_HIT_PX = 26;
  const hitAt = (p: { x: number; y: number }): HitBox | null => {
    const inside = (b: HitBox["box"], pad = 0) =>
      p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
    // The photo covers the whole artboard, so it is an exact hit EVERYWHERE.
    // Letting it into this first pass made the forgiving pass unreachable and
    // a one-pixel miss on a text line selected the backdrop instead.
    const real = hitsRef.current.filter((h) => h.id !== "photo");
    const exact = [...real].reverse().find((h) => inside(h.box));
    if (exact) return exact;
    const grow = Math.max(0, (MIN_HIT_PX / Math.max(scale, 0.05)) / 2);
    let best: HitBox | null = null;
    let bestD = Infinity;
    for (const h of real) {
      if (!inside(h.box, grow)) continue;
      const cx = h.box.x + h.box.w / 2;
      const cy = h.box.y + h.box.h / 2;
      // Vertical distance dominates: stacked text lines differ in y, not x.
      const d = Math.abs(p.y - cy) * 3 + Math.abs(p.x - cx) * 0.15;
      if (d < bestD) { bestD = d; best = h; }
    }
    // Nothing near: the backdrop, which is what an empty click should select.
    return best ?? hitsRef.current.find((h) => h.id === "photo" && inside(h.box)) ?? null;
  };

  /** The box-bearing layer behind an id — fixed slots AND free library images.
   *  Four separate ternaries used to spell out flag/coach/logo; adding a fifth
   *  kind to each of them is how one of them gets missed. */
  const boxLayerOf = (st: PromoState, id: string | null) => {
    if (id === "flag") return st.flag;
    if (id === "coach") return st.coach;
    if (id === "logo") return st.logo;
    if (id?.startsWith("img-")) return (st.images ?? []).find((i) => i.id === id) ?? null;
    return null;
  };

  /**
   * Pointer → artboard coordinates.
   *
   * Derived ENTIRELY from the measured rect, never from the `scale` state. The
   * two can disagree — `scale` is set by a ResizeObserver, so it lags any
   * layout change by a frame, and the browser rounds the CSS size it actually
   * paints. Dividing a live measurement by a stale number puts the cursor a
   * little away from what it grabs, and the gap grows the further you are from
   * the top-left corner. Measuring both ends is self-consistent by
   * construction.
   */
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: r.width ? (e.clientX - r.left) * (W / r.width) : 0,
      y: r.height ? (e.clientY - r.top) * (H / r.height) : 0,
    };
  };

  const selectedBox = (): { x: number; y: number; w: number; h: number } | null => {
    // the gradient covers the whole canvas and has no hit box (it would eat
    // every click) — it is selected from the Layers panel only
    if (selected === "gradient") return { x: 0, y: 0, w: W, h: H };
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
    } else if (id === "flag" || id === "coach" || id === "logo" || id.startsWith("img-")) {
      const layer0 = boxLayerOf(s, id);
      if (!layer0) return null;
      const b = layer0.box[s.format];
      Object.assign(orig, b);
    } else {
      const t = s.texts.find((x) => x.id === id);
      const hb = hitsRef.current.find((h) => h.id === id);
      if (t && hb) Object.assign(orig, hb.box, { size: t.size, x: t.pos[s.format].x, y: t.pos[s.format].y, w: hb.box.w, h: hb.box.h });
    }
    dragRef.current = { mode, handle, id, key: `drag-${Date.now()}`, startX: p.x, startY: p.y, orig };

    const move = (ev: PointerEvent) => onDrag(ev);
    const up = () => {
      dragRef.current = null;
      setGuides({ v: [], h: [] }); // guides belong to the gesture, not the design
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  /**
   * Snapping. Positioning by eye at 50% zoom means every element sits one or
   * two pixels off the margin it was meant to share, and nothing quite lines up
   * with anything else.
   *
   * Candidate lines come from the artboard (edges, safe margin, centre) and
   * from every OTHER visible element (its edges and its centre) — so elements
   * align to each other, not just to the page. The moving element offers its
   * own left/centre/right (and top/middle/bottom); the closest pairing inside
   * the threshold wins per axis, and the guides that actually bit are drawn.
   *
   * Threshold is in SCREEN pixels converted to artboard units, so it feels the
   * same however far you are zoomed out. Hold Alt to place freely.
   */
  const SNAP_PX = 7;
  const MARGIN = 56; // the template's own left/right margin
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  /** Snap lines, weighted. The artboard's own margins and centre carry HALF the
   *  apparent distance, so they win unless an element line is genuinely much
   *  closer: the shared margin is the line a poster is actually built on, and
   *  an unweighted nearest-wins kept stealing it for whatever element happened
   *  to sit a few pixels nearer. */
  type SnapLine = { at: number; w: number; k?: 0 | 1 | 2 };
  const snapTargets = (movingId: string) => {
    // 0.35, not 0.5: at 0.5 an element line six pixels away still beat the
    // page margin fifteen away, which is the wrong instinct — the margin is
    // where a poster's content belongs, and everything else is incidental.
    const v: SnapLine[] = [0, MARGIN, W / 2, W - MARGIN, W].map((at) => ({ at, w: 0.35 }));
    const h: SnapLine[] = [0, MARGIN, H / 2, H - MARGIN, H].map((at) => ({ at, w: 0.35 }));
    for (const hit of hitsRef.current) {
      if (hit.id === movingId || hit.id === "photo") continue;
      const b = hit.box;
      // `k` records WHICH edge this line is, so an element line only attracts
      // the same edge: left↔left, centre↔centre, right↔right. Matching a right
      // edge to some unrelated left edge is arithmetically a snap and visually
      // a random jump. Canvas lines (k undefined) still attract any edge.
      v.push({ at: b.x, w: 1, k: 0 }, { at: b.x + b.w / 2, w: 1, k: 1 }, { at: b.x + b.w, w: 1, k: 2 });
      h.push({ at: b.y, w: 1, k: 0 }, { at: b.y + b.h / 2, w: 1, k: 1 }, { at: b.y + b.h, w: 1, k: 2 });
    }
    return { v, h };
  };

  /** Nudge a moving box onto nearby lines; returns the correction + what bit. */
  const snapBox = (
    box: { x: number; y: number; w: number; h: number },
    movingId: string,
    tol: number,
  ): { dx: number; dy: number; v: number[]; h: number[] } => {
    const t = snapTargets(movingId);
    const mine = (o: number, size: number) => [o, o + size / 2, o + size];
    let dx = 0, dy = 0, bestX = tol, bestY = tol;
    const vHit: number[] = [], hHit: number[] = [];
    mine(box.x, box.w).forEach((edge, ki) => {
      for (const target of t.v) {
        if (target.k !== undefined && target.k !== ki) continue;
        const gap = target.at - edge;
        if (Math.abs(gap) > tol) continue;          // out of reach on the real distance
        const score = Math.abs(gap) * target.w;     // …but judged on the weighted one
        if (score < bestX) { bestX = score; dx = gap; vHit.length = 0; vHit.push(target.at); }
      }
    });
    mine(box.y, box.h).forEach((edge, ki) => {
      for (const target of t.h) {
        if (target.k !== undefined && target.k !== ki) continue;
        const gap = target.at - edge;
        if (Math.abs(gap) > tol) continue;
        const score = Math.abs(gap) * target.w;
        if (score < bestY) { bestY = score; dy = gap; hHit.length = 0; hHit.push(target.at); }
      }
    });
    return { dx, dy, v: vHit, h: hHit };
  };

  const onDrag = (ev: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toCanvas(ev);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const f = stateRef.current.format;
    /*
     * Threshold in SCREEN pixels so it feels the same at any zoom — but CAPPED
     * in artboard units. On a small window the artboard sits at ~27%, where
     * seven screen pixels are twenty-six design pixels: a purely horizontal
     * drag was yanking the element two dozen pixels DOWN onto some line it was
     * never near. Snapping should confirm what you were already aiming at, not
     * relocate things.
     */
    const r = wrapRef.current?.getBoundingClientRect();
    const tol = Math.min(SNAP_PX * (r?.width ? W / r.width : 2), 24);
    let nextGuides: { v: number[]; h: number[] } = { v: [], h: [] };
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
      if (d.id === "flag" || d.id === "coach" || d.id === "logo" || d.id.startsWith("img-")) {
        const layer = boxLayerOf(s, d.id);
        if (!layer) return s;
        const b = layer.box[f];
        if (d.mode === "move") {
          let nx = d.orig.x + dx;
          let ny = d.orig.y + dy;
          if (!ev.altKey) {
            const sn = snapBox({ x: nx, y: ny, w: d.orig.w, h: d.orig.h }, d.id, tol);
            nx += sn.dx; ny += sn.dy;
            nextGuides = { v: sn.v, h: sn.h };
          }
          b.x = Math.round(nx);
          b.y = Math.round(ny);
        } else {
          resizeBox(b, d.orig, d.handle!, dx, dy);
        }
        return s;
      }
      const t = s.texts.find((x) => x.id === d.id);
      if (!t) return s;
      if (d.mode === "move") {
        // A text's anchor is its top-left, but it should snap by what you SEE —
        // so we snap the drawn box and move the anchor by the same correction.
        const drawn = hitsRef.current.find((hb) => hb.id === d.id)?.box;
        let nx = d.orig.x + dx;
        let ny = d.orig.y + dy;
        if (!ev.altKey && drawn) {
          const sn = snapBox(
            { x: nx + (drawn.x - t.pos[f].x), y: ny + (drawn.y - t.pos[f].y), w: drawn.w, h: drawn.h },
            d.id,
            tol,
          );
          nx += sn.dx; ny += sn.dy;
          nextGuides = { v: sn.v, h: sn.h };
        }
        t.pos[f].x = Math.round(nx);
        t.pos[f].y = Math.round(ny);
      } else {
        // corner drag scales the font size proportionally to the width change
        const sign = d.handle?.includes("w") ? -1 : 1;
        const ratio = clamp((d.orig.w + sign * dx) / Math.max(1, d.orig.w), 0.2, 6);
        t.size = clamp(Math.round((d.orig.size ?? t.size) * ratio), 9, 420);
      }
      return s;
    }, d.key);
    setGuides(nextGuides);
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
    const hit = hitAt(p);
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
      }, "wheel-zoom");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [patch]);

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toCanvas(e);
    const hit = hitAt(p);
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
        if (selected === "flag" || selected === "coach" || selected === "logo" || selected?.startsWith("img-")) {
          const bl = boxLayerOf(s, selected);
          if (!bl) return s;
          const b = bl.box[f];
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
  /** The text layer currently selected, if any — drives the always-visible
   *  editor strip. Double-click still works; this exists because the only hint
   *  that it did was a grey line under a 1350px-tall artboard, i.e. off-screen. */
  const selectedText = state.texts.find((t) => t.id === selected) ?? null;

  const editingLayer = state.texts.find((t) => t.id === editingText) ?? null;
  const editBox = editingText ? hitsRef.current.find((h) => h.id === editingText)?.box : null;

  const commitText = (value: string) => {
    if (editingText) patchText(editingText, (t) => (t.text = value.replace(/\r/g, "")));
    setEditingText(null);
  };

  // -- layer ordering ---------------------------------------------------------
  const layerLabel = (id: string): string => {
    if (id === "flag") return "Flag";
    if (id === "logo") return "Logo";
    if (id === "coach") return "Coach";
    if (id === "gradient") return "NP7 gradient";
    if (id.startsWith("img-")) return (state.images ?? []).find((i) => i.id === id)?.name ?? "Image";
    const t = state.texts.find((x) => x.id === id);
    return t ? TEXT_KIND_LABELS[t.kind] : id;
  };
  const layerVisible = (id: string): boolean => {
    if (id === "flag") return state.flag.visible;
    if (id === "logo") return state.logo.visible;
    if (id === "coach") return state.coach.visible;
    if (id === "gradient") return state.gradient?.visible ?? false;
    if (id.startsWith("img-")) return (state.images ?? []).find((i) => i.id === id)?.visible ?? false;
    return state.texts.find((x) => x.id === id)?.visible ?? false;
  };
  // Drag & drop reordering in the Layers panel. `over` is the insertion SLOT
  // in the top-first list (0 = above the first row, n = below the last).
  const [layerDrag, setLayerDrag] = useState<null | { id: string; over: number }>(null);
  const layerListRef = useRef<HTMLDivElement>(null);

  const reorderLayer = (id: string, slot: number) =>
    patch((s) => {
      const rev = [...promoOrder(s)].reverse(); // top-first, like the panel
      const from = rev.indexOf(id);
      if (from < 0) return s;
      rev.splice(from, 1);
      const insertAt = clamp(slot > from ? slot - 1 : slot, 0, rev.length);
      rev.splice(insertAt, 0, id);
      s.order = [...rev].reverse();
      return s;
    });

  const onLayerRowPointerDown = (e: React.PointerEvent, id: string) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "INPUT") return; // the eye keeps working
    e.preventDefault();
    const startY = e.clientY;
    let started = false;
    const slotAt = (clientY: number) => {
      const rows = Array.from(layerListRef.current?.querySelectorAll("[data-lrow]") ?? []);
      let slot = 0;
      for (const r of rows) {
        const rect = (r as HTMLElement).getBoundingClientRect();
        if (clientY > rect.top + rect.height / 2) slot++;
      }
      return slot;
    };
    const move = (ev: PointerEvent) => {
      if (!started && Math.abs(ev.clientY - startY) > 4) started = true;
      if (started) setLayerDrag({ id, over: slotAt(ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (started) reorderLayer(id, slotAt(ev.clientY));
      else setSelected(id); // plain click still selects
      setLayerDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
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

        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border,#ddd)" }}>
          <button
            onClick={undo}
            disabled={!pastRef.current.length}
            title="Undo (⌘Z)"
            className="px-3 py-1.5 text-sm font-bold disabled:opacity-30"
            style={{ background: "var(--admin-surface,#fff)", color: "var(--admin-text,#111)" }}
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!futureRef.current.length}
            title="Redo (⇧⌘Z)"
            className="px-3 py-1.5 text-sm font-bold disabled:opacity-30"
            style={{ background: "var(--admin-surface,#fff)", color: "var(--admin-text,#111)", borderLeft: "1px solid var(--admin-border,#ddd)" }}
          >
            ↷
          </button>
        </div>

        {(["edition", "layers", "elements", "designs"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMenu(menu === m ? null : m);
              if (m === "edition") loadEditions();
              if (m === "designs") loadDesigns();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{
              background: menu === m ? "var(--admin-accent,#00afdb)" : "var(--admin-surface,#fff)",
              border: "1px solid var(--admin-border,#ddd)",
              color: menu === m ? "#fff" : "var(--admin-text,#111)",
            }}
          >
            {m === "edition" ? "From edition ▾" : m === "layers" ? "Layers ▾" : m === "elements" ? "Elements ▾" : "Designs ▾"}
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
        <button onClick={() => setPicker("add")} className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
          title="Drop any image from the media library onto the artboard">
          + Image
        </button>
        <button onClick={() => exportPng(["45", "916"])} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0a2a33]">
          Export both
        </button>
      </div>

      {/*
       * Selected-element editor. Editing text already worked by double-clicking
       * it on the artboard, but the only thing that said so was a grey hint line
       * BELOW a 1350px artboard — permanently off-screen. A gesture nobody can
       * discover is a feature nobody has, so the text is editable right here,
       * in the open, the moment something is selected.
       */}
      {/*
       * Reserved slot for the selected-element editors. Its height is FIXED so
       * that selecting something cannot change the layout: the artboard scales
       * to the space left over, so a strip appearing on click would rescale and
       * shift the very element you just grabbed, out from under the cursor.
       */}
      <div className="mb-3" style={{ height: 92, overflow: "hidden" }}>
      {/* A selected library image: swap it, give it the house shadow, remove it. */}
      {selected?.startsWith("img-") && (() => {
        const im = (state.images ?? []).find((i) => i.id === selected);
        if (!im) return null;
        return (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl"
            style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)" }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--admin-text-muted,#666)" }}>Image</span>
            <input
              value={im.name}
              onChange={(e) => patch((st) => {
                const x = (st.images ?? []).find((i) => i.id === im.id);
                if (x) x.name = e.target.value.slice(0, 40);
                return st;
              })}
              className="px-2 py-1.5 rounded-lg text-sm w-44"
              style={{ background: "var(--admin-input-bg,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
              title="What the Layers panel calls it"
            />
            <button onClick={() => setPicker("add-replace")} className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}>Replace…</button>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--admin-text,#111)" }}>
              <input type="checkbox" checked={im.shadow ?? false}
                onChange={(e) => patch((st) => {
                  const x = (st.images ?? []).find((i) => i.id === im.id);
                  if (x) x.shadow = e.target.checked;
                  return st;
                })} />
              shadow
            </label>
            <button
              onClick={() => patch((st) => {
                st.images = (st.images ?? []).filter((i) => i.id !== im.id);
                st.order = (st.order ?? []).filter((x) => x !== im.id);
                return st;
              })}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ border: "1px solid var(--admin-border,#ddd)", color: "#e05a3a" }}
            >Remove</button>
          </div>
        );
      })()}

      {selectedText && (
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl"
          style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)" }}>
          <div className="flex-1 min-w-[260px]">
            <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1"
              style={{ color: "var(--admin-text-muted,#666)" }}>
              {TEXT_KIND_LABELS[selectedText.kind]} — text
            </label>
            <textarea
              value={selectedText.text}
              onChange={(e) => patchText(selectedText.id, (t) => (t.text = e.target.value.replace(/\r/g, "")))}
              rows={selectedText.text.includes("\n") ? 2 : 1}
              className="w-full px-3 py-1.5 rounded-lg text-sm resize-y"
              style={{ background: "var(--admin-input-bg,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}
              placeholder="Type here…"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1"
              style={{ color: "var(--admin-text-muted,#666)" }}>Size</label>
            <input type="number" min={8} max={400} value={Math.round(selectedText.size)}
              onChange={(e) => patchText(selectedText.id, (t) => (t.size = Math.max(8, Math.min(400, Number(e.target.value) || t.size))))}
              className="w-20 px-2 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--admin-input-bg,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }} />
          </div>
          <button onClick={() => setSelected(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text-muted,#666)" }}>
            Done
          </button>
          <span className="text-[11px] w-full" style={{ color: "var(--admin-text-muted,#666)" }}>
            Line breaks split the line. Wrap words in *stars* for the gold accent.
          </span>
        </div>
      )}

      {!selected && (
        <p className="text-[11px] pt-1" style={{ color: "var(--admin-text-muted,#666)" }}>
          Click an element to edit its text, size or image here.
        </p>
      )}
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
          {menu === "layers" && (
            <div className="flex flex-col" ref={layerListRef}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--admin-text-muted,#666)" }}>
                Top layer first — drag a row to reorder
              </div>
              {[...promoOrder(state)].reverse().map((id, idx) => (
                <div key={id}>
                  <div
                    className="h-0.5 mx-1 rounded"
                    style={{ background: layerDrag && layerDrag.over === idx ? "var(--admin-accent,#00afdb)" : "transparent" }}
                  />
                  <div
                    data-lrow
                    className="flex items-center gap-2 px-2 py-1 rounded select-none touch-none"
                    style={{
                      background: selected === id ? "rgba(0,175,219,0.12)" : undefined,
                      opacity: layerDrag?.id === id ? 0.35 : layerVisible(id) ? 1 : 0.45,
                      cursor: layerDrag ? "grabbing" : "grab",
                    }}
                    onPointerDown={(e) => onLayerRowPointerDown(e, id)}
                  >
                    <span className="text-[10px] tracking-tighter" style={{ color: "var(--admin-text-muted,#666)" }}>
                      ⠿
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHidden(id, !layerVisible(id));
                      }}
                      title={layerVisible(id) ? "Hide" : "Show"}
                      className="w-5"
                    >
                      {layerVisible(id) ? "👁" : "◌"}
                    </button>
                    <span className="flex-1 text-xs font-semibold">{layerLabel(id)}</span>
                  </div>
                </div>
              ))}
              <div
                className="h-0.5 mx-1 rounded"
                style={{ background: layerDrag && layerDrag.over === promoOrder(state).length ? "var(--admin-accent,#00afdb)" : "transparent" }}
              />
              <div className="text-[10px] mt-1" style={{ color: "var(--admin-text-muted,#666)" }}>
                Photo & colour washes are always the base.
              </div>
            </div>
          )}
          {menu === "elements" && (
            <div className="flex flex-wrap gap-3">
              {[
                { id: "flag", label: "Flag", vis: state.flag.visible },
                { id: "coach", label: "Coach", vis: state.coach.visible },
                { id: "logo", label: "Logo", vis: state.logo.visible },
                { id: "gradient", label: "NP7 gradient", vis: state.gradient?.visible ?? false },
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
                <button
                  onClick={() => { setMenu(null); setGallery(true); }}
                  className="mb-1 px-2 py-1.5 rounded-lg text-xs font-bold text-white bg-[#00afdb]"
                >
                  Browse all graphics ({designs.length})
                </button>
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
                    replaceState(defaultPromoState());
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
          {/* Alignment guides — only while a snap is actually biting, so they
              read as confirmation rather than as chrome. */}
          {guides.v.map((x, i) => (
            <div key={`gv${i}`} className="absolute pointer-events-none"
              style={{ left: x * scale, top: 0, width: 1, height: H * scale, background: "#00e5ff", opacity: 0.9 }} />
          ))}
          {guides.h.map((y, i) => (
            <div key={`gh${i}`} className="absolute pointer-events-none"
              style={{ top: y * scale, left: 0, height: 1, width: W * scale, background: "#00e5ff", opacity: 0.9 }} />
          ))}

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
                  <Mini label="zoom" min={100} max={260} value={state.photo.focal[fmt].zoom} onChange={(v) => patch((s) => ((s.photo.focal[s.format].zoom = v), s), "sl-zoom")} />
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
                  <Mini label="opacity" min={5} max={100} value={Math.round(state.flag.opacity * 100)} onChange={(v) => patch((s) => ((s.flag.opacity = v / 100), s), "sl-op")} />
                  <Mini label="rotate" min={-45} max={45} value={state.flag.rotate} onChange={(v) => patch((s) => ((s.flag.rotate = v), s), "sl-rot")} />
                  <Mini label="fade" min={0} max={60} value={state.flag.fadeSide} onChange={(v) => patch((s) => ((s.flag.fadeSide = v), s), "sl-fs")} />
                  <Mini label="fade ↓" min={5} max={90} value={state.flag.fadeDown[fmt]} onChange={(v) => patch((s) => ((s.flag.fadeDown[s.format] = v), s), "sl-fd")} />
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
              {sel === "gradient" && state.gradient && (
                <>
                  <select
                    value={state.gradient.preset}
                    onChange={(e) => patch((s) => ((s.gradient!.preset = e.target.value), s))}
                    className="bg-transparent border border-white/30 rounded px-1 py-0.5"
                  >
                    {Object.entries(GRADIENT_PRESETS).map(([k, p]) => (
                      <option key={k} value={k} className="text-black">{p.label}</option>
                    ))}
                  </select>
                  <Mini label="angle" min={0} max={360} value={state.gradient.angle} onChange={(v) => patch((s) => ((s.gradient!.angle = v), s), "sl-ga")} />
                  <Mini label="strength" min={0} max={100} value={state.gradient.strength} onChange={(v) => patch((s) => ((s.gradient!.strength = v), s), "sl-gs")} />
                  <Mini label="fade from" min={0} max={90} value={state.gradient.start} onChange={(v) => patch((s) => ((s.gradient!.start = v), s), "sl-g0")} />
                  <Mini label="fade to" min={5} max={100} value={state.gradient.end} onChange={(v) => patch((s) => ((s.gradient!.end = v), s), "sl-g1")} />
                </>
              )}
              {selText && (
                <>
                  <button onClick={() => setEditingText(sel)} className="underline">edit text</button>
                  <Mini label="size" min={9} max={selText.kind === "place" ? 420 : 90} value={selText.size} onChange={(v) => patch((s) => { const t = s.texts.find((x) => x.id === sel); if (t) t.size = v; return s; }, "sl-size")} />
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
        Click = select · drag = move · corners = size · edges = stretch X/Y · double-click text = edit · ⌫ = hide · arrows = nudge · alt = ignore snapping · *stars* = gold accent in the details/partner lines
      </p>

      {gallery && (
        <PromoGallery
          designs={designs}
          fonts={fontsRef.current}
          currentId={designId}
          onOpen={(d) => { loadDesign(d); setGallery(false); }}
          onNew={() => { replaceState(defaultPromoState()); setDesignId(null); setGallery(false); }}
          onClose={() => setGallery(false)}
          onRename={async (d, name) => {
            await fetch(`/api/admin/promo/designs/${d.id}`, {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            }).catch(() => {});
            loadDesigns();
          }}
          onDuplicate={async (d) => {
            await fetch("/api/admin/promo/designs", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `${d.name} copy`, format: d.format, state: d.state }),
            }).catch(() => {});
            loadDesigns();
          }}
          onDelete={async (d) => {
            await fetch(`/api/admin/promo/designs/${d.id}`, { method: "DELETE" }).catch(() => {});
            if (designId === d.id) setDesignId(null);
            loadDesigns();
          }}
        />
      )}

      {/* image picker */}
      {picker && (
        <ImagePickerModal
          defaultFolder={picker === "coach" ? "experiences/shared" : undefined}
          onSelect={(url) => {
            patch((s) => {
              if (picker === "photo") s.photo.src = url;
              if (picker === "coach") s.coach.src = url;
              if (picker === "logo") s.logo.src = url;
              if (picker === "add-replace" && selected?.startsWith("img-")) {
                const x = (s.images ?? []).find((i) => i.id === selected);
                if (x) x.src = url;
              }
              if (picker === "add") {
                /*
                 * A new library image. It lands CENTRED at a modest size rather
                 * than at 0,0 or full-bleed: a layer you cannot see is a layer
                 * you think failed to add, and one covering the artboard hides
                 * the poster you were looking at.
                 */
                const { w: cw, h: ch } = PROMO_FORMATS[s.format];
                const side = Math.round(cw * 0.42);
                const box = { x: Math.round((cw - side) / 2), y: Math.round((ch - side) / 2), w: side, h: side };
                const other = PROMO_FORMATS[s.format === "45" ? "916" : "45"];
                const oSide = Math.round(other.w * 0.42);
                const oBox = { x: Math.round((other.w - oSide) / 2), y: Math.round((other.h - oSide) / 2), w: oSide, h: oSide };
                const id = `img-${Date.now().toString(36)}${Math.round(Math.random() * 1e4).toString(36)}`;
                const name = (url.split("/").pop() || "Image").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 28);
                const layer = {
                  id, name, src: url, visible: true, shadow: false,
                  box: s.format === "45"
                    ? { "45": box, "916": oBox }
                    : { "45": oBox, "916": box },
                } as (NonNullable<PromoState["images"]>)[number];
                s.images = [...(s.images ?? []), layer];
                // Just under the coach, so a new sticker never lands on the face.
                const ord = promoOrder(s).filter((x) => x !== id);
                const at = Math.max(0, ord.indexOf("coach"));
                ord.splice(at, 0, id);
                s.order = ord;
                queueMicrotask(() => setSelected(id));
              }
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
