"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

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

  useEffect(() => {
    if (!elRef.current || points.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

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
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (points.length === 0) return null;
  return <div ref={elRef} className="relative z-0 w-full h-[400px] sm:h-[460px] rounded-3xl overflow-hidden border border-[#ece3d3] shadow-[0_10px_36px_rgba(0,55,74,0.1)]" />;
}
