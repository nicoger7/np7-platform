"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { attachBaseLayers } from "@/lib/leaflet-base";
import { bindTwoFingerHint, bindZoomButtons, coarsePointer } from "./map-controls";

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
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coarseRef = useRef(false);
  const teardownRef = useRef<(() => void)[]>([]);

  // One transient line for the moments the map owes an answer: a zoom button
  // with nowhere left to go, a one-finger drag that scrolled the page instead.
  const flash = (msg: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote(msg);
    noteTimer.current = setTimeout(() => setNote(null), 2200);
  };

  useEffect(() => {
    if (!elRef.current || spots.length === 0 || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cluster) await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      const el = elRef.current;
      // A phone's single finger belongs to the PAGE. `dragging:false` drops
      // Leaflet's `leaflet-touch-drag` class, so the container keeps
      // `touch-action: pan-x pan-y` and a one-finger drag scrolls straight past
      // the map; two fingers still pan and pinch it via the touchZoom handler.
      const coarse = coarsePointer();
      coarseRef.current = coarse;
      // zoomSnap 0.5: fractional zoom lets fitBounds hug the pins instead of
      // letterboxing a whole-world view (the grey band above the tile edge).
      const map = L.map(el, { scrollWheelZoom: false, dragging: !coarse, touchZoom: true, zoomControl: true, zoomSnap: 0.5, worldCopyJump: true });
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'); // strip Leaflet's default Ukraine-flag prefix
      mapRef.current = map;

      // Scroll-zoom follows the POINTER on a mouse or trackpad: over the map the
      // wheel zooms, off it the page scrolls again. It used to demand a click
      // first, which meant the obvious gesture — hover and scroll — scrolled
      // straight past the map and looked broken.
      //
      // Only on a fine pointer. On touch there is no hover and no wheel: a
      // single finger belongs to the page (see `dragging:false` above) and two
      // fingers pinch, so nothing here applies and a synthetic mouseover from a
      // tap must not change anything.
      map.on("blur", () => map.scrollWheelZoom.disable());
      if (!coarse) {
        // pointerenter/pointerleave on the CONTAINER, not Leaflet's
        // mouseover/mouseout on the map.
        //
        // Leaflet's versions behave like mouseover/mouseout: they fire as the
        // pointer crosses onto a child layer. So moving onto a marker — or
        // clicking a spot — raised `mouseout`, zoom switched off, and because
        // the pointer never re-entered the container from outside, no
        // `mouseover` ever came back. You had to click the map to wake it up.
        //
        // pointerenter/pointerleave don't fire for children, so the map stays
        // "hovered" the whole time the cursor is anywhere inside it, markers
        // and popups included.
        const enter = () => { map.scrollWheelZoom.enable(); setZoomHint(true); };
        const leave = () => { map.scrollWheelZoom.disable(); setZoomHint(false); };
        el.addEventListener("pointerenter", enter);
        el.addEventListener("pointerleave", leave);
        teardownRef.current.push(() => {
          el.removeEventListener("pointerenter", enter);
          el.removeEventListener("pointerleave", leave);
        });
      } else {
        map.on("mouseout", () => map.scrollWheelZoom.disable());
      }

      // `voyager_nolabels`: no country/place labels. Carto renders them in each
      // region's LOCAL language (Arabic, Chinese, "América do Sul"…), which looked
      // messy on the world overview; the spot pins carry the names, so a clean
      // label-free base reads best.
      // street/satellite base layers + toggle
      attachBaseLayers(L, map);

      const teardrop = (fill: string, border: string) =>
        `position:relative;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${fill};border:${border};box-shadow:0 3px 9px rgba(0,55,74,.4)`;
      const markers = spots.map((s) => {
        // The pin colours ARE the verification ladder, and the eye must rank
        // them the way the ladder does. Solid amber sat next to the gold end of
        // the NP7 gradient and read as MORE verified than community green — so
        // pending is genuinely hollow now: a dashed amber outline on a pale
        // fill, unmistakably an unfinished spot. Solid green = community-
        // verified; the sun-to-sea gradient stays the NP7 gold tier.
        const pending = s.verification === "pending";
        const fill = pending ? "#fff7ec" : s.verification === "community" ? "#1f9e57" : "linear-gradient(135deg,#ffc42e,#f47b20,#00afdb)";
        const border = pending ? "2.5px dashed #d97706" : "2.5px solid #fff";
        const dot = pending ? "#d97706" : "#fff";
        const icon = L.divIcon({
          className: "",
          html: `<div style="${teardrop(fill, border)}"><div style="transform:rotate(45deg);width:100%;height:100%;display:flex;align-items:center;justify-content:center"><span style="width:7px;height:7px;border-radius:50%;background:${dot};display:block"></span></div></div>`,
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
      // FILL the card: don't zoom out past the point where the world tile band
      // (±85°) is shorter than the container — that's what letterboxes water
      // above/below. Min zoom = world height ≥ container height, and vertical
      // panning stays inside the tiled band.
      const coverZoom = () => {
        const h = elRef.current?.clientHeight ?? 460;
        const fill = Math.max(1, Math.ceil(Math.log2(h / 256) * 2) / 2);
        // Showing the spots outranks filling the card, though. A tall, narrow
        // container (a phone in fullscreen) needs a wider view than the fill
        // zoom allows: at 366×820 the fill rule floors the map at z2, where only
        // 4 of the 6 spots fit on screen — behind a "−" that is dead on arrival.
        // A band of ocean above and below beats losing a third of the map.
        // Measured against a floor of 1 so the last floor can't ratchet the fit up.
        map.setMinZoom(1);
        const fitsAll = boundsRef.current ? map.getBoundsZoom(boundsRef.current) : fill;
        map.setMinZoom(Math.min(fill, fitsAll));
      };
      coverZoom();
      map.setMaxBounds(L.latLngBounds(L.latLng(-85, -720), L.latLng(85, 720)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).__coverZoom = coverZoom;
      map.fitBounds(boundsRef.current);
      if (spots.length === 1) map.setZoom(11);

      const zoomBtns = bindZoomButtons(map, el, (dir) =>
        flash(dir === "out" ? "You're already showing the whole map" : "That's as close as the map goes")
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).__syncZoom = zoomBtns.sync;
      teardownRef.current.push(zoomBtns.dispose);
      if (coarse) teardownRef.current.push(bindTwoFingerHint(map, el, () => flash("Use two fingers to move the map")));
    })();
    return () => {
      cancelled = true;
      teardownRef.current.forEach((fn) => fn());
      teardownRef.current = [];
      if (noteTimer.current) clearTimeout(noteTimer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).__syncZoom?.();
    }, 60);
    if (full) {
      map.scrollWheelZoom.enable(); // fullscreen = clearly a map context
      // The page can't scroll behind a fullscreen map, so the one finger is the
      // map's again — no reason to ask for two.
      map.dragging.enable();
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    }
    if (coarseRef.current) map.dragging.disable(); // back in the page: one finger scrolls again
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
        {/* what the map has to say: a flashed answer first, else the wheel hint */}
        {(note || (zoomHint && !full)) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-4">
            <span className="rounded-full bg-[#00374a]/85 text-white text-[11.5px] font-bold px-3.5 py-1.5 backdrop-blur-sm text-center">
              {note ?? (coarseRef.current ? "Pinch to zoom · two fingers to pan" : "Scroll to zoom · drag to pan")}
            </span>
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
