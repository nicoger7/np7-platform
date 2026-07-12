/**
 * Shared Leaflet base layers for every spotguide map: the CARTO street map plus
 * an Esri World Imagery satellite layer, with a small "Satellite / Map" toggle
 * control on the map itself. The rider's choice sticks (localStorage), so every
 * map across the spotguide opens in their preferred view.
 *
 * Client-only (call inside the components' dynamic-leaflet effect).
 */

const PREF_KEY = "np7:map-satellite";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function attachBaseLayers(L: any, map: any, opts: { labels?: boolean } = {}) {
  const street = L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/rastertiles/${opts.labels ? "voyager" : "voyager_nolabels"}/{z}/{x}/{y}{r}.png`,
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }
  );
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
