/**
 * Shared Leaflet base layers for every spotguide map: a light street map plus
 * an Esri World Imagery satellite layer, with a small "Satellite / Map" toggle
 * control on the map itself. The rider's choice sticks (localStorage), so every
 * map across the spotguide opens in their preferred view.
 *
 * BOTH layers are Esri, and keyless on purpose. The street map used to be
 * CARTO's voyager tiles, which were keyless when they were wired up and are
 * not any more: CARTO now answers an unauthenticated request with a 200 and a
 * tile that has "API KEY REQUIRED" stamped diagonally across it. Nothing
 * errored, nothing logged — every public map just quietly filled with
 * watermarks. A tile server that fails by SERVING something is worth
 * remembering: monitoring a status code would never have caught it.
 *
 * Client-only (call inside the components' dynamic-leaflet effect).
 */

const PREF_KEY = "np7:map-satellite";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function attachBaseLayers(L: any, map: any, opts: { labels?: boolean } = {}) {
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
  const esriAttr = "Tiles &copy; Esri";
  const base = L.tileLayer(`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: esriAttr,
    maxZoom: 19,
  });
  /*
   * Labels are a SEPARATE layer here, where CARTO baked them into the tile.
   * That is why the labelled variant is a group rather than one URL: the
   * callers that pass `labels: false` want a quiet backdrop for their own
   * markers, and an unlabelled Esri canvas is exactly that.
   */
  const street = opts.labels
    ? L.layerGroup([
        base,
        L.tileLayer(`${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
          attribution: esriAttr,
          maxZoom: 19,
          pane: "overlayPane",
        }),
      ])
    : base;
  // Keyless Esri imagery — the same source as our satellite hero fallbacks.
  const sat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imagery &copy; Esri", maxZoom: 19 }
  );

  let on = false;
  try { on = localStorage.getItem(PREF_KEY) === "1"; } catch { /* private mode etc. */ }
  (on ? sat : street).addTo(map);

  const btn = L.DomUtil.create("button");
  btn.type = "button";
  Object.assign(btn.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 13px",
    borderRadius: "9999px",
    background: "rgba(255,255,255,0.95)",
    border: "none",
    boxShadow: "0 4px 14px rgba(0,55,74,0.25)",
    font: "700 12px system-ui, sans-serif",
    color: "#00374a",
    cursor: "pointer",
    // sit BESIDE the zoom control (right of +), not stacked below it — Leaflet
    // stacks corner controls via clear:both; clearing that floats us alongside,
    // top-aligned with the "+" (both carry the same 10px corner margin).
    clear: "none",
  });
  const ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/></svg>';
  const paint = () => { btn.innerHTML = `${ICON}<span>${on ? "Map" : "Satellite"}</span>`; };
  paint();
  btn.onclick = () => {
    on = !on;
    if (on) { map.removeLayer(street); sat.addTo(map); }
    else { map.removeLayer(sat); street.addTo(map); }
    try { localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch { /* fine */ }
    paint();
  };

  // Constructor options (not extend-time — those don't reliably apply).
  const ctl = new L.Control({ position: "topleft" });
  ctl.onAdd = () => {
    // keep map drag/zoom/scroll from hijacking the button
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.disableScrollPropagation(btn);
    return btn;
  };
  map.addControl(ctl);
}
