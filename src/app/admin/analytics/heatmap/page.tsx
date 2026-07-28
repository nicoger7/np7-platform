"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Point = { x: number; y: number; t: string };
type PageRow = { path: string; clicks: number };
type Device = "desktop" | "mobile";
type TypeFilter = "all" | "click" | "dead_click" | "rage_click";

const WIDTHS: Record<Device, number> = { desktop: 1200, mobile: 390 };
const TYPE_LABEL: Record<TypeFilter, string> = { all: "All clicks", click: "Clicks", dead_click: "Dead clicks", rage_click: "Rage clicks" };

/** 256-entry blue→cyan→lime→yellow→red palette for the density colouring. */
function palette(): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 1;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, "#2b5cff");
  grad.addColorStop(0.35, "#00d0ff");
  grad.addColorStop(0.55, "#38ff8f");
  grad.addColorStop(0.78, "#ffe14d");
  grad.addColorStop(1.0, "#ff2d2d");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 1);
  return g.getImageData(0, 0, 256, 1).data;
}

let PAL: Uint8ClampedArray | null = null;

/** Individual dots stop at this many points — beyond it, only the density wash. */
const MARKER_MAX = 400;

const TYPE_COLOR: Record<string, string> = { click: "#00c2e8", dead_click: "#ffb020", rage_click: "#ff2d2d" };

/** Density heatmap: accumulate soft radial dots, then colour by intensity. */
function drawHeatmap(canvas: HTMLCanvasElement, points: Point[], w: number, h: number, radius: number) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!points.length || h <= 0) return;

  // With few points the old fixed intensity painted near-invisible washes (a
  // lone click ≈ a faint blue blob — indistinguishable on a blue hero). Scale
  // per-point intensity to the sample size so small data still reads.
  const core = points.length < 40 ? 0.45 : points.length < 200 ? 0.28 : 0.16;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const t = tmp.getContext("2d")!;
  for (const p of points) {
    const x = (p.x / 100) * w, y = (p.y / 100) * h;
    const rg = t.createRadialGradient(x, y, 0, x, y, radius);
    rg.addColorStop(0, `rgba(0,0,0,${core})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    t.fillStyle = rg;
    t.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const img = t.getImageData(0, 0, w, h);
  PAL = PAL || palette();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a > 0) {
      const o = Math.min(255, a) * 4;
      d[i] = PAL[o]; d[i + 1] = PAL[o + 1]; d[i + 2] = PAL[o + 2];
      d[i + 3] = Math.min(220, a * 3.2);
    }
  }
  ctx.putImageData(img, 0, 0);

  // At low volume, also mark every click as a crisp white-ringed dot (coloured
  // by type) — guaranteed visible on any page background, dark heroes included.
  if (points.length <= MARKER_MAX) {
    for (const p of points) {
      const x = (p.x / 100) * w, y = (p.y / 100) * h;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLOR[p.t] || TYPE_COLOR.click;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.stroke();
    }
  }
}

export default function HeatmapPage() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [path, setPath] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [type, setType] = useState<TypeFilter>("all");
  const [days, setDays] = useState(30);
  const [points, setPoints] = useState<Point[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [frameH, setFrameH] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const width = WIDTHS[device];

  // Pages with click data (for the picker).
  useEffect(() => {
    (async () => {
      const d = await fetch(`/api/admin/analytics/heatmap?days=${days}`).then((r) => r.json()).catch(() => ({ pages: [] }));
      setPages(d.pages || []);
      setPath((prev) => prev || d.pages?.[0]?.path || "");
    })();
  }, [days]);

  // Points for the selected page.
  useEffect(() => {
    if (!path) { setPoints([]); setCount(0); return; }
    let alive = true;
    setLoading(true);
    const tq = type === "all" ? "" : `&type=${type}`;
    fetch(`/api/admin/analytics/heatmap?path=${encodeURIComponent(path)}&device=${device}${tq}&days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!alive) return; setPoints(d.points || []); setCount(d.count || 0); setLoading(false); })
      .catch(() => { if (alive) { setPoints([]); setCount(0); setLoading(false); } });
    return () => { alive = false; };
  }, [path, device, type, days]);

  // The canvas bitmap, its CSS size and the iframe height must all come from the
  // SAME number — drawing from a live re-measure while CSS keeps an older frameH
  // squashed the dots so they stopped tracking the page on scroll.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawHeatmap(canvas, points, width, frameH || 1200, device === "mobile" ? 15 : 22);
  }, [points, width, device, frameH]);

  useEffect(() => { redraw(); }, [redraw]);

  const syncTimer = useRef<number | null>(null);
  useEffect(() => () => { if (syncTimer.current) window.clearInterval(syncTimer.current); }, []);

  const onFrameLoad = () => {
    // The public site reveals content on scroll (IntersectionObserver +
    // opacity-0/translate classes). Inside this preview iframe those observers
    // never fire for anything outside the admin viewport, leaving the page
    // blank. Same origin, so we can force the fully-revealed state — this is a
    // static backdrop, not a live page. Viewport-height sections are pinned to a
    // fixed height: inside this full-page-tall iframe, 100vh = the whole page,
    // which otherwise balloons the layout on every measure (feedback loop →
    // stretched blank space at the bottom).
    const flatten = () => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc || doc.getElementById("np7-heatmap-reveal")) return;
        const s = doc.createElement("style");
        s.id = "np7-heatmap-reveal";
        s.textContent = `
          .opacity-0 { opacity: 1 !important; }
          .translate-y-8, .-translate-y-8, .translate-x-8, .-translate-x-8 { transform: none !important; }
          .h-screen, [class*="h-[100vh]"], [class*="h-[100svh]"], [class*="h-[100dvh]"],
          [class*="h-[82vh]"], [class*="h-[85vh]"], [class*="h-[90vh]"] { height: 820px !important; }
          .min-h-screen, [class*="min-h-[100"], [class*="min-h-screen"] { min-height: 820px !important; }
          /* inline vh styles (e.g. the 795vh scroll-story hero) — stylesheet
             !important outranks non-important inline styles */
          [style*="vh"] { height: 820px !important; min-height: 0 !important; }
        `;
        doc.head.appendChild(s);
      } catch { /* cross-origin — leave the page as-is */ }
    };
    const measure = () => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc?.body) return;
        const h = Math.min(40000, Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight));
        setFrameH((prev) => (Math.abs(prev - h) > 4 ? h : prev));
      } catch { setFrameH(2400); }
    };
    // Sync until the page settles (fonts, images, maps, late client mounts) —
    // vh sections are pinned, so repeated measuring converges instead of growing.
    if (syncTimer.current) window.clearInterval(syncTimer.current);
    flatten();
    measure();
    let runs = 0;
    syncTimer.current = window.setInterval(() => {
      flatten();
      measure();
      if (++runs >= 8 && syncTimer.current) { window.clearInterval(syncTimer.current); syncTimer.current = null; }
    }, 1500);
  };

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${active ? "text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)]" : "admin-muted"}`;

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold admin-heading mb-1">Heatmaps</h1>
        <p className="text-xs admin-faint">Where visitors click on each page — first-party, consent-gated. Green→red = more clicks. Dead/rage clicks show where people click but nothing works.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={path} onChange={(e) => setPath(e.target.value)} className="px-3 py-2 rounded-lg text-sm admin-input" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          {pages.length === 0 && <option value="">No pages with clicks yet</option>}
          {pages.map((p) => <option key={p.path} value={p.path}>{p.path} ({p.clicks})</option>)}
        </select>

        <div className="flex items-center gap-1">
          {(["desktop", "mobile"] as Device[]).map((dv) => (
            <button key={dv} onClick={() => setDevice(dv)} className={pill(device === dv)} style={device === dv ? undefined : { border: "1px solid var(--admin-border)" }}>{dv}</button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {(Object.keys(TYPE_LABEL) as TypeFilter[]).map((tf) => (
            <button key={tf} onClick={() => setType(tf)} className={pill(type === tf)} style={type === tf ? undefined : { border: "1px solid var(--admin-border)" }}>{TYPE_LABEL[tf]}</button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={pill(days === n)} style={days === n ? undefined : { border: "1px solid var(--admin-border)" }}>{n}d</button>
          ))}
        </div>

        <span className="text-xs admin-faint ml-auto">{loading ? "Loading…" : `${count.toLocaleString("en-US")} clicks`}</span>
      </div>

      {count > 0 && count <= MARKER_MAX && !loading && (
        <div className="flex items-center gap-4 mb-3 text-[11px] admin-faint">
          <span className="font-bold uppercase tracking-wide">Each dot = one click</span>
          {(["click", "dead_click", "rage_click"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: TYPE_COLOR[k], boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }} />
              {TYPE_LABEL[k === "click" ? "click" : k]}
            </span>
          ))}
        </div>
      )}

      {/* Viewer */}
      {!path ? (
        <div className="rounded-xl py-20 text-center" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-heading font-bold mb-1">No click data yet</p>
          <p className="text-xs admin-faint max-w-md mx-auto">Once consented visitors start clicking around the site, their pages appear here with a click heatmap. Deploy the latest build first.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-auto" style={{ border: "1px solid var(--admin-border)", maxHeight: "72vh", backgroundColor: "var(--admin-surface)" }}>
          <div style={{ position: "relative", width, margin: "0 auto" }}>
            <iframe
              ref={iframeRef}
              src={path}
              onLoad={onFrameLoad}
              title="Page preview"
              // pointer-events none: the preview is a backdrop — clicks must not
              // navigate it (the canvas above already ignores clicks too)
              style={{ width, height: frameH || 1200, border: 0, display: "block", background: "#fff", pointerEvents: "none" }}
            />
            <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width, height: frameH || 1200, pointerEvents: "none" }} />
          </div>
        </div>
      )}

      {count === 0 && path && !loading && (
        <p className="text-xs admin-faint mt-3">No clicks recorded for this page / device / filter in the selected window yet.</p>
      )}
    </>
  );
}
