"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { type Spot, parseCoords } from "@/lib/blog-templates";

/**
 * Overview map for a destination's spots. Vanilla Leaflet + OpenStreetMap tiles
 * (free, no API key, no billing). Numbered markers match the spot list below;
 * only spots with valid coordinates appear. Loaded client-side via dynamic
 * import (Leaflet needs `window`).
 */
export function SpotsMap({ spots, accent, accentInk }: { spots: Spot[]; accent: string; accentInk: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const points = spots
    .map((s, i) => {
      const c = parseCoords(s.coords);
      return c ? { lat: c.lat, lng: c.lng, name: s.name || `Spot ${i + 1}`, n: i + 1 } : null;
    })
    .filter((p): p is { lat: number; lng: number; name: string; n: number } => p !== null);

  useEffect(() => {
    if (!elRef.current || points.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);
      const markers = points.map((p) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${accent};color:${accentInk};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)">${p.n}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        return L.marker([p.lat, p.lng], { icon }).bindPopup(`<strong>${p.name}</strong>`);
      });
      const group = L.featureGroup(markers).addTo(map);
      map.fitBounds(group.getBounds().pad(0.3));
      if (points.length === 1) map.setZoom(11);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (points.length === 0) return null;
  return <div ref={elRef} className="relative z-0 w-full h-[340px] rounded-2xl overflow-hidden border border-[#ece3d3]" />;
}
