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

/** Density heatmap: accumulate soft radial dots, then colour by intensity. */
function drawHeatmap(canvas: HTMLCanvasElement, points: Point[], w: number, h: number, radius: number) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!points.length || h <= 0) return;

  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const t = tmp.getContext("2d")!;
  for (const p of points) {
    const x = (p.x / 100) * w, y = (p.y / 100) * h;
    const rg = t.createRadialGradient(x, y, 0, x, y, radius);
    rg.addColorStop(0, "rgba(0,0,0,0.16)");
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

  const redraw = useCallback(() => {
    const iframe = iframeRef.current, canvas = canvasRef.current;
    if (!iframe || !canvas) return;
    let h = frameH;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    } catch { /* cross-origin (shouldn't happen, same origin) */ }
    if (h > 0) drawHeatmap(canvas, points, width, h, device === "mobile" ? 15 : 22);
  }, [points, width, device, frameH]);

  useEffect(() => { redraw(); }, [redraw]);

  const onFrameLoad = () => {
    const measure = () => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (doc?.body) setFrameH(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight));
      } catch { setFrameH(2400); }
    };
    measure();
    setTimeout(measure, 800); // catch late layout (images/fonts)
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
              style={{ width, height: frameH || 1200, border: 0, display: "block", background: "#fff" }}
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
