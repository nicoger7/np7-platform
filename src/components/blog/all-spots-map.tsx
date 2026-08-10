"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { attachBaseLayers } from "@/lib/leaflet-base";

export type SpotPoint = { lat: number; lng: number; spot: string; title: string; slug: string; region?: string };

/**
 * "Where we ride" — one map with every spot from every magazine spotguide.
 * Vanilla Leaflet (free, no key) on CartoDB Voyager tiles (cleaner + more
 * colourful than raw OSM), with sun→sea teardrop pins; each popup links to its
 * spotguide. Loaded client-side (Leaflet needs `window`).
 */
export function AllSpotsMap({ points }: { points: SpotPoint[] }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [ready, setReady] = useState(false); // hide the skeleton once tiles+pins are in

  useEffect(() => {
    if (!elRef.current || points.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { scrollWheelZoom: false });
      // Wheel zooms while the pointer is over the map, and the page scrolls
      // again once it leaves — the same rule as the spotguide map. A coarse
      // pointer fires a synthetic mouseover on tap and has no wheel, so it is
      // left alone: one finger scrolls the page, two pinch the map.
      if (!window.matchMedia("(pointer: coarse)").matches) {
        map.on("mouseover", () => map.scrollWheelZoom.enable());
        map.on("mouseout", () => map.scrollWheelZoom.disable());
      }
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'); // strip Leaflet's default Ukraine-flag prefix
      mapRef.current = map;
      // `voyager_nolabels`: no country/place labels — Carto's raster tiles render
      // them in each region's LOCAL language (Arabic, Chinese, "América do Sul"…),
      // which looked messy. The destination pins carry the names, so a clean
      // label-free base reads best.
      // street/satellite base layers + toggle
      attachBaseLayers(L, map);

      const pin = `position:relative;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#ffc42e,#f47b20,#00afdb);border:2.5px solid #fff;box-shadow:0 3px 9px rgba(0,55,74,.4)`;
      const dot = `transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center`;
      const markers = points.map((p) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="${pin}"><div style="${dot}"><span style="width:8px;height:8px;border-radius:50%;background:#fff;display:block"></span></div></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -26],
        });
        const sub = [p.title, p.region].filter(Boolean).join(" · ");
        return L.marker([p.lat, p.lng], { icon }).bindPopup(
          `<div style="font-family:inherit;min-width:150px"><strong style="color:#00374a;font-size:13.5px">${p.spot}</strong>` +
            `<div style="color:#6a7a80;font-size:12px;margin-top:2px">${sub}</div>` +
            `<a href="/blog/${p.slug}" style="color:#00afdb;font-weight:700;font-size:12.5px;display:inline-block;margin-top:6px;text-decoration:none">Read the spotguide →</a></div>`
        );
      });
      const group = L.featureGroup(markers).addTo(map);
      map.fitBounds(group.getBounds().pad(0.25));
      if (points.length === 1) map.setZoom(9);
      // A tick after the tile layer starts loading — the container has a map now.
      map.whenReady(() => { if (!cancelled) setReady(true); });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (points.length === 0) return null;
  return (
    <div className="relative z-0 w-full h-[400px] sm:h-[460px] rounded-3xl overflow-hidden border border-[#ece3d3] shadow-[0_10px_36px_rgba(0,55,74,0.1)]">
      <div ref={elRef} className="absolute inset-0" />
      {/* Light skeleton until Leaflet mounts — so the block never flashes empty. */}
      <div className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
        style={{ background: "linear-gradient(135deg,#eaf4f6,#f3ece0)" }} aria-hidden>
        <div className="absolute inset-0 animate-pulse" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(0,175,219,0.08), transparent 60%)" }} />
        <div className="relative flex items-center gap-2 text-[#9aa6ac]">
          <svg className="w-5 h-5 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          <span className="text-[13px] font-semibold">Loading the map…</span>
        </div>
      </div>
    </div>
  );
}
