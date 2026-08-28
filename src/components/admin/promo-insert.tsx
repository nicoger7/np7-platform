"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PROMO_FORMATS, type PromoFormat, type PromoState } from "@/lib/promo-template";
import { drawPromo, loadPromoImage, promoImageSources, type PromoFonts } from "@/lib/promo-render";

type DesignRow = { id: string; name: string; format: string; state: PromoState; updated_at: string };

/**
 * Put a graphic you already made into an email.
 *
 * The studio can already draw any saved design at either size; the only thing
 * missing between "I made a poster" and "I sent it to 2,000 people" was a
 * bridge. This is the bridge: pick a saved design, pick the shape, and it is
 * rendered here in the browser (the same canvas the studio and the PNG export
 * use, so what you send is what you designed), uploaded to the media library,
 * and handed back as a URL the mail can point at.
 *
 * Rendering client-side is deliberate: there is exactly ONE renderer, so a mail
 * can never drift from the poster. A server-side copy would be a second one.
 */
function Thumb({ state, fonts, onReady }: { state: PromoState; fonts: PromoFonts; onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    const canvas = ref.current;
    if (!canvas) return;
    const fmt = (state.format ?? "45") as PromoFormat;
    const { w, h } = PROMO_FORMATS[fmt] ?? PROMO_FORMATS["45"];
    const scale = 200 / w;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    (async () => {
      await Promise.all(promoImageSources(state).map((s) => loadPromoImage(s).catch(() => null)));
      if (dead) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.scale(scale, scale);
      try { drawPromo(ctx, state, fonts); } catch { /* a broken saved state must not kill the picker */ }
      ctx.restore();
      onReady?.();
    })();
    return () => { dead = true; };
  }, [state, fonts, onReady]);
  return <canvas ref={ref} className="block w-full h-auto rounded-lg" style={{ background: "var(--admin-input-bg,#eef2f3)" }} />;
}

export default function PromoInsertModal({
  fonts, onInsert, onClose,
}: {
  fonts: PromoFonts;
  /** Called with the uploaded image URL once the render has landed in storage. */
  onInsert: (url: string, design: DesignRow, format: PromoFormat) => void;
  onClose: () => void;
}) {
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [format, setFormat] = useState<PromoFormat>("45");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/promo/designs")
      .then((r) => r.json())
      .then((d) => setDesigns(Array.isArray(d) ? d : []))
      .catch(() => setDesigns([]))
      .finally(() => setLoading(false));
  }, []);

  const insert = useCallback(async (d: DesignRow) => {
    setBusy(d.id);
    setError(null);
    try {
      // Render at FULL size — an email opened on a retina phone shows a
      // half-resolution image as mush, and the file is a one-off cost.
      const state: PromoState = { ...d.state, format };
      await Promise.all(promoImageSources(state).map((s) => loadPromoImage(s).catch(() => null)));
      const { w, h } = PROMO_FORMATS[format];
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable in this browser.");
      drawPromo(ctx, state, fonts);
      const blob = await new Promise<Blob | null>((res) => off.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not render the graphic.");

      const slug = (d.name || "promo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "promo";
      const fd = new FormData();
      fd.append("file", new File([blob], `${slug}-${format === "45" ? "4x5" : "9x16"}.png`, { type: "image/png" }));
      fd.append("folder", "email");
      const res = await fetch("/api/admin/images", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed — try again.");
      const j = await res.json().catch(() => ({}));
      const url = j.url || j.publicUrl || j.path;
      if (!url) throw new Error("Uploaded, but no URL came back.");
      onInsert(url, d, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }, [format, fonts, onInsert]);

  return (
    <div className="fixed inset-0 z-[85] flex" style={{ background: "rgba(4,20,26,0.62)" }} onClick={onClose}>
      <div
        className="m-auto w-[min(960px,94vw)] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--admin-bg,#fff)", border: "1px solid var(--admin-border,#ddd)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--admin-border,#ddd)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--admin-text,#111)" }}>Insert a promo graphic</h2>
          <div className="flex rounded-lg overflow-hidden ml-auto" style={{ border: "1px solid var(--admin-border,#ddd)" }}>
            {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map((f) => (
              <button key={f} onClick={() => setFormat(f)} className="px-3 py-1.5 text-xs font-bold"
                style={{
                  background: format === f ? "var(--admin-accent,#00afdb)" : "var(--admin-surface,#fff)",
                  color: format === f ? "#fff" : "var(--admin-text-muted,#666)",
                }}>
                {PROMO_FORMATS[f].label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text-muted,#666)" }}>Close</button>
        </div>

        <p className="px-5 pt-3 text-xs" style={{ color: "var(--admin-text-muted,#666)" }}>
          Pick a graphic — it&apos;s rendered in the shape above, saved to the media library, and dropped into your email.
          The card previews show each design in its OWN saved shape.
        </p>
        {error && <p className="px-5 pt-2 text-xs text-red-500">{error}</p>}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm py-12 text-center" style={{ color: "var(--admin-text-muted,#666)" }}>Loading…</p>
          ) : designs.length === 0 ? (
            <p className="text-sm py-12 text-center" style={{ color: "var(--admin-text-muted,#666)" }}>
              No saved graphics yet. Build one in Promo Studio and press “Save as new”.
            </p>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
              {designs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => insert(d)}
                  disabled={busy !== null}
                  className="rounded-xl p-2.5 text-left disabled:opacity-50 transition-opacity"
                  style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)" }}
                >
                  <Thumb state={d.state} fonts={fonts} />
                  <p className="mt-2 text-[13px] font-semibold truncate" style={{ color: "var(--admin-text,#111)" }}>{d.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--admin-text-muted,#666)" }}>
                    {busy === d.id ? "Rendering & uploading…" : `Insert as ${PROMO_FORMATS[format].label}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
