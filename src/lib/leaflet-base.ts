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
    padding: "6px 12px",
    borderRadius: "9999px",
    background: "rgba(255,255,255,0.95)",
    border: "none",
    boxShadow: "0 4px 14px rgba(0,55,74,0.25)",
    font: "700 12px system-ui, sans-serif",
    color: "#00374a",
    cursor: "pointer",
  });
  const paint = () => { btn.textContent = on ? "🗺 Map" : "🛰 Satellite"; };
  paint();
  btn.onclick = () => {
    on = !on;
    if (on) { map.removeLayer(street); sat.addTo(map); }
    else { map.removeLayer(sat); street.addTo(map); }
    try { localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch { /* fine */ }
    paint();
  };

  // Constructor options (not extend-time — those don't reliably apply). Top-left
  // stacks the toggle under the zoom control on every map; the "Enlarge" buttons
  // live top-right, so this can never collide.
  const ctl = new L.Control({ position: "topleft" });
  ctl.onAdd = () => {
    // keep map drag/zoom/scroll from hijacking the button
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.disableScrollPropagation(btn);
    return btn;
  };
  map.addControl(ctl);
}
