"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapSpot = { lat: number; lng: number; name: string; destSlug: string; destName?: string; verification?: string };

/**
 * Spotguide map — every spot as a teardrop pin (NP7-gold gradient for NP7-
 * verified, green for community), clustered when there are many. Popups link to
 * the spot's destination. Vanilla Leaflet on CartoDB tiles (free, no key),
 * mirroring the magazine map.
 */
export function SpotMap({ spots, cluster = false, height = 420 }: { spots: MapSpot[]; cluster?: boolean; height?: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!elRef.current || spots.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cluster) await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd", maxZoom: 19,
      }).addTo(map);

      const teardrop = (fill: string) =>
        `position:relative;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${fill};border:2.5px solid #fff;box-shadow:0 3px 9px rgba(0,55,74,.4)`;
      const markers = spots.map((s) => {
        const fill = s.verification === "community" ? "#1f9e57" : "linear-gradient(135deg,#ffc42e,#f47b20,#00afdb)";
        const icon = L.divIcon({
          className: "",
          html: `<div style="${teardrop(fill)}"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center"><span style="width:7px;height:7px;border-radius:50%;background:#fff;display:block"></span></div></div>`,
          iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
        });
        return L.marker([s.lat, s.lng], { icon }).bindPopup(
          `<div style="font-family:inherit;min-width:150px"><strong style="color:#00374a;font-size:13.5px">${s.name}</strong>` +
            (s.destName ? `<div style="color:#6a7a80;font-size:12px;margin-top:2px">${s.destName}</div>` : "") +
            `<a href="/spotguide/${s.destSlug}" style="color:#00afdb;font-weight:700;font-size:12.5px;display:inline-block;margin-top:6px;text-decoration:none">View spot →</a></div>`
        );
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer: any = cluster && (L as any).markerClusterGroup ? (L as any).markerClusterGroup({ maxClusterRadius: 45 }) : L.featureGroup();
      markers.forEach((m) => layer.addLayer(m));
      layer.addTo(map);
      map.fitBounds(layer.getBounds().pad(0.25));
      if (spots.length === 1) map.setZoom(11);
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (spots.length === 0) return null;
  return <div ref={elRef} className="relative z-0 w-full rounded-3xl overflow-hidden border border-[#ece3d3] shadow-[0_10px_36px_rgba(0,55,74,0.1)]" style={{ height }} />;
}
