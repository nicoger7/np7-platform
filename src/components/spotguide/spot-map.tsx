"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { attachBaseLayers } from "@/lib/leaflet-base";

export type MapSpot = {
  lat: number; lng: number; name: string; destSlug: string;
  /** Anchor id of this spot's row in the list below (destination page only).
   *  Present → the popup jumps to and opens that row instead of navigating to
   *  the destination you are already looking at. */
  anchor?: string; destName?: string; verification?: string;
  // Optional destination context for a richer popup card (index map only).
  thumb?: string | null; rating?: number; ratingKind?: "np7" | "member"; spotCount?: number; toVerifyCount?: number; level?: string | null;
  spotRating?: number; spotRatingKind?: "np7" | "member"; spotRatingCount?: number;
};

/**
 * Spotguide map — NP7-branded pins on CARTO tiles, destination-aware clustering
 * (zoomed out, a destination's spots collapse into one branded bubble with a
 * count; zooming in splits them apart), scroll-zoom that only engages after a
 * click (so the page keeps scrolling normally), and a fullscreen "Enlarge" mode.
 */
export function SpotMap({ spots, cluster = false, height = 420, linkLabel = "View spot →", focusDests = null }: {
  spots: MapSpot[]; cluster?: boolean; height?: number; linkLabel?: string;
  /** Destination slugs to focus on (filter sync): non-matching pins hide and the
   *  map flies to the rest. null = show everything. */
  focusDests?: string[] | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [full, setFull] = useState(false);
  const [zoomHint, setZoomHint] = useState(false);

  useEffect(() => {
    if (!elRef.current || spots.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cluster) await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      // zoomSnap 0.5: fractional zoom lets fitBounds hug the pins instead of
      // letterboxing a whole-world view (the grey band above the tile edge).
      const map = L.map(elRef.current, { scrollWheelZoom: false, zoomControl: true, zoomSnap: 0.5, worldCopyJump: true });
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'); // strip Leaflet's default Ukraine-flag prefix
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
      // street/satellite base layers + toggle
      attachBaseLayers(L, map);

      const teardrop = (fill: string) =>
        `position:relative;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${fill};border:2.5px solid #fff;box-shadow:0 3px 9px rgba(0,55,74,.4)`;
      const markers = spots.map((s) => {
        // pending = proposed but unconfirmed: a hollow amber pin, visibly
        // different from a verified spot so the map never overstates itself
        const pending = s.verification === "pending";
        const fill = pending ? "#f0a500" : s.verification === "community" ? "#1f9e57" : "linear-gradient(135deg,#ffc42e,#f47b20,#00afdb)";
        const icon = L.divIcon({
          className: "",
          html: `<div style="${teardrop(fill)}"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center"><span style="width:7px;height:7px;border-radius:50%;background:#fff;display:block"></span></div></div>`,
          iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
        });
        // Richer card: thumbnail + a meta row (rating · spots · level) when the
        // caller supplies destination context; falls back to the plain card.
        // The rating / spot count / level all describe the DESTINATION, not this
        // one pin — shown under a spot's name they read as the spot's score. So
        // the destination name leads the row and owns everything after it.
        const meta: string[] = [];
        if (s.rating && s.rating > 0) meta.push(`<span style="font-weight:700;color:#00374a">${s.ratingKind === "np7" ? "NP7 " : ""}★ ${s.rating.toFixed(1)}</span>`);
        if (s.spotCount) meta.push(`<span>${s.spotCount} spot${s.spotCount === 1 ? "" : "s"}</span>`);
        if (s.toVerifyCount) meta.push(`<span style="color:#b0791e;font-weight:700">${s.toVerifyCount} to verify</span>`);
        if (s.level) meta.push(`<span>${s.level}</span>`);
        const destMeta = meta.length > 0;
        const m = L.marker([s.lat, s.lng], { icon }).bindPopup(
          `<div style="font-family:inherit;width:${s.thumb ? 200 : 158}px">` +
            (s.thumb ? `<div style="height:92px;border-radius:10px;background:#e8f1f3 center/cover no-repeat;background-image:url('${s.thumb}');margin-bottom:8px"></div>` : "") +
            `<strong style="color:#00374a;font-size:13.5px">${s.name}</strong>` +
            (pending ? `<div style="margin-top:2px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#b0791e">Proposed · needs confirming</div>` : "") +
            // The SPOT's own score, right under its name — NP7's if set, else the
            // member average with its rater count.
            (s.spotRating && s.spotRating > 0
              ? `<div style="margin-top:2px;font-size:12px;font-weight:700;color:#00374a">${s.spotRatingKind === "np7" ? "NP7 " : ""}★ ${s.spotRating.toFixed(1)}` +
                (s.spotRatingKind === "member" && s.spotRatingCount ? `<span style="font-weight:500;color:#8a9aa0"> · ${s.spotRatingCount} member${s.spotRatingCount === 1 ? "" : "s"}</span>` : "") +
                `</div>`
              : "") +
            // No destination stats → plain "which destination is this in?" line.
            (s.destName && !destMeta ? `<div style="color:#6a7a80;font-size:12px;margin-top:1px">${s.destName}</div>` : "") +
            (destMeta
              ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e8eef0">` +
                  (s.destName ? `<div style="color:#6a7a80;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${s.destName} — the destination</div>` : "") +
                  `<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:3px;font-size:11.5px;color:#5a6b72">${meta.join("")}</div>` +
                `</div>`
              : "") +
            `<a href="${s.anchor ? `#${s.anchor}` : `/spotguide/${s.destSlug}`}" style="display:block;margin-top:10px;background:linear-gradient(90deg,#00afdb,#0891b2);color:#fff;font-weight:800;font-size:13px;text-align:center;padding:10px 14px;border-radius:999px;text-decoration:none;box-shadow:0 4px 12px rgba(0,175,219,0.35)">${linkLabel}</a></div>`
        );
        // stash the destination on the marker so clusters can label themselves
        // and the focus filter can pick its pins
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).__dest = s.destName ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).__destSlug = s.destSlug;
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
      layerRef.current = layer;
      markersRef.current = markers;
      boundsRef.current = layer.getBounds().pad(0.25);
      // FILL the card: never zoom out past the point where the world tile band
      // (±85°) is shorter than the container — that's what letterboxes water
      // above/below. Min zoom = world height ≥ container height, and vertical
      // panning stays inside the tiled band.
      const coverZoom = () => {
        const h = elRef.current?.clientHeight ?? 460;
        map.setMinZoom(Math.max(1, Math.ceil(Math.log2(h / 256) * 2) / 2));
      };
      coverZoom();
      map.setMaxBounds(L.latLngBounds(L.latLng(-85, -720), L.latLng(85, 720)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).__coverZoom = coverZoom;
      map.fitBounds(boundsRef.current);
      if (spots.length === 1) map.setZoom(11);
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter sync: show only the focused destinations' pins and fly to them.
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    const focus = focusDests ? new Set(focusDests) : null;
    let any = false;
    for (const m of markersRef.current) {
      const keep = !focus || focus.has(m.__destSlug);
      const has = layer.hasLayer(m);
      if (keep && !has) layer.addLayer(m);
      if (!keep && has) layer.removeLayer(m);
      if (keep) any = true;
    }
    const target = any ? layer.getBounds().pad(0.25) : boundsRef.current;
    if (target?.isValid?.()) map.flyToBounds(target, { duration: 0.8, maxZoom: 9 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDests ? [...focusDests].sort().join("|") : null]);

  // Fullscreen: same map instance, the wrapper just changes shape.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      map.invalidateSize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).__coverZoom?.();
      if (boundsRef.current) map.fitBounds(boundsRef.current);
    }, 60);
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
        {/* backdrop = CARTO voyager water, so any letterboxed edge reads as ocean, not grey */}
        <div ref={elRef} className="relative z-0 w-full h-full" style={{ backgroundColor: "#d4e6ec", ...(full ? {} : { height }) }} />
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
