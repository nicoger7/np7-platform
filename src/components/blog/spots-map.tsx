"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { attachBaseLayers } from "@/lib/leaflet-base";
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
      await import("leaflet.markercluster"); // augments L with markerClusterGroup
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { scrollWheelZoom: false });
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'); // strip Leaflet's default Ukraine-flag prefix
      mapRef.current = map;
      // street/satellite base layers + toggle (labelled — article maps need place context)
      attachBaseLayers(L, map, { labels: true });

      const pin = (bg: string, fg: string, size: number, fontSize: number, label: string | number) =>
        `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${fontSize}px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)">${label}</div>`;

      // Cluster overlapping pins into a count badge; zoom in (or click) to split.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clusterGroup = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 40, // only merge pins that are close enough to overlap
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iconCreateFunction: (cluster: any) =>
          L.divIcon({ className: "", html: pin(accent, accentInk, 36, 14, cluster.getChildCount()), iconSize: [36, 36], iconAnchor: [18, 18] }),
      });
      points.forEach((p) => {
        const icon = L.divIcon({ className: "", html: pin(accent, accentInk, 28, 13, p.n), iconSize: [28, 28], iconAnchor: [14, 14] });
        clusterGroup.addLayer(L.marker([p.lat, p.lng], { icon }).bindPopup(`<strong>${p.name}</strong>`));
      });
      map.addLayer(clusterGroup);
      // fit all spots just inside the frame (snug, with a little breathing room)
      map.fitBounds(clusterGroup.getBounds().pad(0.12), { maxZoom: 12 });
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
