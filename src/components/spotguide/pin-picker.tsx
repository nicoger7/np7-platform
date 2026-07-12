"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { attachBaseLayers } from "@/lib/leaflet-base";

/** Click-to-drop a pin → returns coordinates. Used in the member add-spot flow
    so every submitted spot is precisely located. */
export function PinPicker({ value, onChange, height = 260 }: { value: { lat: number; lng: number } | null; onChange: (c: { lat: number; lng: number }) => void; height?: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const start = value ?? { lat: 30, lng: 0 };
      const map = L.map(elRef.current, { scrollWheelZoom: false }).setView([start.lat, start.lng], value ? 11 : 2);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'); // strip Leaflet's default Ukraine-flag prefix
      mapRef.current = map;
      // street/satellite base + toggle — satellite is gold for pinning launches/reefs
      attachBaseLayers(L, map, { labels: true });

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#ffc42e,#f47b20,#00afdb);border:2.5px solid #fff;box-shadow:0 3px 9px rgba(0,55,74,.4)"></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });
      const place = (lat: number, lng: number) => {
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        else markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        cbRef.current({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
      };
      if (value) place(value.lat, value.lng);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => place(e.latlng.lat, e.latlng.lng));
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={elRef} className="relative z-0 w-full rounded-xl overflow-hidden border border-[#e2d8c6]" style={{ height }} />
      <p className="text-[11px] text-[#9aa6ac] mt-1">{value ? `Pin: ${value.lat}, ${value.lng}` : "Tap the map to drop a pin on the spot."}</p>
    </div>
  );
}
