"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapSpot = {
  lat: number; lng: number; name: string; destSlug: string; destName?: string; verification?: string;
  // Optional destination context for a richer popup card (index map only).
  thumb?: string | null; rating?: number; ratingKind?: "np7" | "member"; spotCount?: number; level?: string | null;
};

/**
 * Spotguide map — NP7-branded pins on CARTO tiles, destination-aware clustering
 * (zoomed out, a destination's spots collapse into one branded bubble with a
 * count; zooming in splits them apart), scroll-zoom that only engages after a
 * click (so the page keeps scrolling normally), and a fullscreen "Enlarge" mode.
 */
export function SpotMap({ spots, cluster = false, height = 420, linkLabel = "View spot →" }: { spots: MapSpot[]; cluster?: boolean; height?: number; linkLabel?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  const [full, setFull] = useState(false);
  const [zoomHint, setZoomHint] = useState(false);

  useEffect(() => {
    if (!elRef.current || spots.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cluster) await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { scrollWheelZoom: false, zoomControl: true });
      mapRef.current = map;

      // Scroll-zoom engages only after a click — otherwise wheel/trackpad keeps
      // scrolling the page (the "zoom doesn't work well" fix).
      map.on("click focus", () => { map.scrollWheelZoom.enable(); setZoomHint(false); });
      map.on("mouseout blur", () => map.scrollWheelZoom.disable());
      map.on("mouseover", () => { if (!map.scrollWheelZoom.enabled()) setZoomHint(true); });
      map.on("mouseout", () => setZoomHint(false));

      // `voyager_nolabels`: no country/place labels. Carto renders them in each
      // region's LOCAL language (Arabic, Chinese, "América do Sul"…), which looked
      // messy on the world overview; the spot pins carry the names, so a clean
      // label-free base reads best.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
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
        // Richer card: thumbnail + a meta row (rating · spots · level) when the
        // caller supplies destination context; falls back to the plain card.
        const meta: string[] = [];
        if (s.rating && s.rating > 0) meta.push(`<span style="font-weight:700;color:#00374a">${s.ratingKind === "np7" ? "NP7 " : ""}★ ${s.rating.toFixed(1)}</span>`);
        if (s.spotCount) meta.push(`<span>${s.spotCount} spot${s.spotCount === 1 ? "" : "s"}</span>`);
        if (s.level) meta.push(`<span>${s.level}</span>`);
        const m = L.marker([s.lat, s.lng], { icon }).bindPopup(
          `<div style="font-family:inherit;width:${s.thumb ? 200 : 158}px">` +
            (s.thumb ? `<div style="height:92px;border-radius:10px;background:#e8f1f3 center/cover no-repeat;background-image:url('${s.thumb}');margin-bottom:8px"></div>` : "") +
            `<strong style="color:#00374a;font-size:13.5px">${s.name}</strong>` +
            (s.destName ? `<div style="color:#6a7a80;font-size:12px;margin-top:1px">${s.destName}</div>` : "") +
            (meta.length ? `<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px;font-size:11.5px;color:#5a6b72">${meta.join("")}</div>` : "") +
            `<a href="/spotguide/${s.destSlug}" style="color:#00afdb;font-weight:700;font-size:12.5px;display:block;margin-top:8px;text-decoration:none">${linkLabel}</a></div>`
        );
        // stash the destination on the marker so clusters can label themselves
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).__dest = s.destName ?? "";
        return m;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LM: any = L;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer: any = cluster && LM.markerClusterGroup
        ? LM.markerClusterGroup({
            maxClusterRadius: 60,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            // Branded cluster bubble: sun-to-sea gradient with the spot count,
            // plus the destination name when every spot inside is from one place.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            iconCreateFunction: (c: any) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dests = new Set(c.getAllChildMarkers().map((m: any) => m.__dest).filter(Boolean));
              const label = dests.size === 1 ? [...dests][0] : "";
              return LM.divIcon({
                className: "",
                html:
                  `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-4px)">` +
                  `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#ffc42e,#f47b20,#00afdb);border:3px solid #fff;box-shadow:0 4px 14px rgba(0,55,74,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px">${c.getChildCount()}</div>` +
                  (label ? `<span style="background:#fff;color:#00374a;font-size:10px;font-weight:800;padding:1px 7px;border-radius:99px;box-shadow:0 2px 6px rgba(0,55,74,.2);white-space:nowrap">${label}</span>` : "") +
                  `</div>`,
                iconSize: [38, 38], iconAnchor: [19, 19],
              });
            },
          })
        : L.featureGroup();
      markers.forEach((m) => layer.addLayer(m));
      layer.addTo(map);
      boundsRef.current = layer.getBounds().pad(0.25);
      map.fitBounds(boundsRef.current);
      if (spots.length === 1) map.setZoom(11);
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fullscreen: same map instance, the wrapper just changes shape.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => { map.invalidateSize(); if (boundsRef.current) map.fitBounds(boundsRef.current); }, 60);
    if (full) {
      map.scrollWheelZoom.enable(); // fullscreen = clearly a map context
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    }
    return () => clearTimeout(t);
  }, [full]);

  if (spots.length === 0) return null;
  return (
    <div className={full ? "fixed inset-0 z-[120] bg-[#00131b]/60 backdrop-blur-sm p-3 sm:p-8" : "relative isolate"}>
      <div className={`relative overflow-hidden ${full ? "h-full rounded-2xl shadow-2xl" : "rounded-3xl border border-[#ece3d3] shadow-[0_10px_36px_rgba(0,55,74,0.1)]"}`}>
        <div ref={elRef} className="relative z-0 w-full h-full" style={full ? undefined : { height }} />
        {/* soft edge blend into the cream page background */}
        {!full && (
          <div className="pointer-events-none absolute inset-0 z-[400] rounded-3xl" style={{ boxShadow: "inset 0 0 0 1px rgba(0,55,74,0.06), inset 0 16px 26px -20px rgba(255,247,236,0.95), inset 0 -16px 26px -20px rgba(255,247,236,0.95)" }} />
        )}
        {/* click-to-zoom hint */}
        {zoomHint && !full && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
            <span className="rounded-full bg-[#00374a]/85 text-white text-[11.5px] font-bold px-3.5 py-1.5 backdrop-blur-sm">Click the map to zoom</span>
          </div>
        )}
        {/* enlarge / close */}
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          aria-label={full ? "Close full map" : "Enlarge map"}
          className="absolute top-3 right-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white/95 text-[#00374a] text-[12px] font-bold pl-3 pr-3.5 py-2 shadow-[0_4px_14px_rgba(0,55,74,0.25)] hover:bg-white transition-colors"
        >
          {full ? (
            <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>Close</>
          ) : (
            <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>Enlarge</>
          )}
        </button>
      </div>
    </div>
  );
}
