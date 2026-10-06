"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { attachBaseLayers } from "@/lib/leaflet-base";
import { WORLD_VIEW, viewHolds, viewKey, type PinView, type PinPoint } from "@/lib/pin-view";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Point the map at a view: a box to fit, or a centre and zoom. */
function applyView(L: any, map: LeafletMap, v: PinView, animate: boolean) {
  if (v.kind === "bounds") {
    map.fitBounds(L.latLngBounds([[v.south, v.west], [v.north, v.east]]), { maxZoom: v.maxZoom, padding: [24, 24], animate });
  } else {
    map.setView([v.lat, v.lng], v.zoom, { animate });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Click-to-drop a pin → returns coordinates. Used in the member add-spot flow
    so every submitted spot is precisely located.

    Opens on the world unless told otherwise (Nico, 6 Oct 2026): pass `view` to
    open where the rider already is (the destination, or their country); when
    `view` changes and the pin is not in it, the map follows. `context` draws
    the spots already in the guide as faint dots, and `locate` adds a
    "Use my location" button that asks the browser only when tapped. All three
    are optional, so the admin editor and "move the pin" behave as before. */
export function PinPicker({ value, onChange, height = 260, view, context, locate = false }: {
  value: { lat: number; lng: number } | null;
  onChange: (c: { lat: number; lng: number }) => void;
  height?: number;
  view?: PinView | null;
  context?: PinPoint[];
  locate?: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const youRef = useRef<CircleMarker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const cbRef = useRef(onChange);
  // Read at init time, so a view that arrives before Leaflet has loaded (the
  // /api/geo answer usually does) is the one the map opens on.
  const viewRef = useRef<PinView | null>(view ?? null);
  const valueRef = useRef(value);
  const contextRef = useRef(context);
  // refs are synced after render, never during it
  useEffect(() => { cbRef.current = onChange; valueRef.current = value; });
  const [locMsg, setLocMsg] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { scrollWheelZoom: false });
      applyView(L, map, value ? { kind: "centre", lat: value.lat, lng: value.lng, zoom: 11 } : (viewRef.current ?? WORLD_VIEW), false);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'); // strip Leaflet's default Ukraine-flag prefix
      mapRef.current = map;
      // street/satellite base + toggle — satellite is gold for pinning launches/reefs
      attachBaseLayers(L, map, { labels: true });

      // Spots already in the guide. Tapping one names it and does NOT drop the
      // pin there (no bubbling to the map click), so nobody re-adds it by accident.
      for (const p of contextRef.current ?? []) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        const dot = L.circleMarker([p.lat, p.lng], {
          radius: 6, color: "#ffffff", weight: 2, fillColor: "#00374a", fillOpacity: 0.5, bubblingMouseEvents: false,
        }).addTo(map);
        if (p.name) dot.bindTooltip(p.name, { direction: "top", offset: [0, -6] });
      }

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
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; youRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow a new view (another destination picked, the country arrived), but
  // never pull the map away from a pin the rider already dropped inside it.
  const key = viewKey(view);
  useEffect(() => {
    viewRef.current = view ?? null;
    const map = mapRef.current, L = LRef.current;
    if (!map || !L || !view) return;
    if (valueRef.current && viewHolds(view, valueRef.current)) return;
    applyView(L, map, view, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function locateMe() {
    if (!navigator.geolocation) { setLocMsg("This browser can't share a location. Move the map instead."); return; }
    setLocating(true); setLocMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const map = mapRef.current, L = LRef.current;
        if (!map || !L) return;
        const at: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        map.setView(at, 15);
        // Where you are is not necessarily the spot (home, the car park), so
        // this only moves the map. The pin stays the rider's own tap.
        if (youRef.current) youRef.current.setLatLng(at);
        else youRef.current = L.circleMarker(at, { radius: 7, color: "#ffffff", weight: 2.5, fillColor: "#2b7cff", fillOpacity: 1, interactive: false }).addTo(map);
        setLocMsg("You're the blue dot. Now tap the spot.");
      },
      (err) => {
        setLocating(false);
        setLocMsg(err.code === err.PERMISSION_DENIED ? "Location is off. Move the map instead." : "Couldn't find you. Move the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div>
      <div ref={elRef} className="relative z-0 w-full rounded-xl overflow-hidden border border-[#e2d8c6]" style={{ height }} />
      <div className="flex items-start justify-between gap-3 mt-1">
        <p className="text-[11px] text-[#9aa6ac]">
          {value ? `Pin: ${value.lat}, ${value.lng}` : locMsg || "Tap the map to drop a pin on the spot."}
          {!value && context && context.length > 0 && !locMsg && <span className="block">Dark dots are spots already in the guide.</span>}
        </p>
        {locate && (
          <button type="button" onClick={locateMe} disabled={locating}
            className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-[#00374a] hover:opacity-70 disabled:opacity-50 py-0.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            {locating ? "Finding you…" : "Use my location"}
          </button>
        )}
      </div>
    </div>
  );
}
