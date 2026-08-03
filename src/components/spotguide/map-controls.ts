import type { Map as LeafletMap } from "leaflet";

/**
 * The two bits of <SpotMap> that live in Leaflet-owned DOM rather than in
 * React's tree: whether a zoom button still has anywhere to go, and the phone
 * gesture contract. Client-only — call from inside the dynamic-leaflet effect.
 */

/** zoomSnap 0.5 puts the map on fractional zooms, so compare with slack. */
const EPS = 1e-6;

/** Finger-first device: the one-finger gesture belongs to the page, not the map. */
export function coarsePointer() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

/**
 * A spent zoom button has to LOOK spent. Leaflet greys it to #bbb on #f4f4f4 —
 * barely a shade on a 26px control — and still hands it the click, which its
 * own handler then drops on the floor. Every map rage-click we logged was that:
 * somebody pressing "−" at the min-zoom clamp, getting silence, pressing again.
 * So: dim it hard, take it out of the tab order, and when it is pressed anyway,
 * say why instead of nothing.
 */
export function bindZoomButtons(
  map: LeafletMap,
  container: HTMLElement,
  onSpent: (dir: "in" | "out") => void
) {
  const zin = container.querySelector<HTMLAnchorElement>(".leaflet-control-zoom-in");
  const zout = container.querySelector<HTMLAnchorElement>(".leaflet-control-zoom-out");
  const spent = { in: false, out: false };

  const paint = (btn: HTMLAnchorElement | null, dead: boolean) => {
    if (!btn) return;
    btn.style.opacity = dead ? "0.42" : "";
    btn.style.cursor = dead ? "not-allowed" : "";
    btn.setAttribute("aria-disabled", dead ? "true" : "false");
    btn.tabIndex = dead ? -1 : 0;
  };
  // Runs after Leaflet's own _updateDisabled (registered at map creation, ours
  // later), so our aria-disabled is the one that survives.
  const sync = () => {
    const z = map.getZoom();
    spent.out = z <= map.getMinZoom() + EPS;
    spent.in = z >= map.getMaxZoom() - EPS;
    paint(zout, spent.out);
    paint(zin, spent.in);
  };
  // Capture phase on the container, so this reads the state the rider actually
  // pressed against: on the button itself we would run after Leaflet's handler
  // and mistake the press that LANDS on the floor for one that died there.
  const onPress = (e: MouseEvent) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (spent.out && t.closest(".leaflet-control-zoom-out")) onSpent("out");
    else if (spent.in && t.closest(".leaflet-control-zoom-in")) onSpent("in");
  };

  sync();
  map.on("zoomend zoomlevelschange", sync);
  container.addEventListener("click", onPress, true);

  return {
    sync,
    dispose: () => {
      map.off("zoomend zoomlevelschange", sync);
      container.removeEventListener("click", onPress, true);
    },
  };
}

/**
 * On touch the map is created with `dragging: false`, which drops Leaflet's
 * `leaflet-touch-drag` class and leaves the container on `touch-action: pan-x
 * pan-y` — so a one-finger drag scrolls the page straight past the map, and two
 * fingers pan and pinch it (Leaflet's touchZoom handler moves the centre by the
 * pinch midpoint on its own, no dragging handler needed). The only thing
 * missing is telling the rider that, the first time their drag slides away.
 *
 * Reports an attempted one-finger pan; the caller owns the wording.
 */
export function bindTwoFingerHint(map: LeafletMap, container: HTMLElement, onOneFinger: () => void) {
  const SLOP = 14; // ignore the wobble in a tap on a pin
  let told = false;
  let x0 = 0, y0 = 0;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length > 1) { told = true; return; } // two fingers: they know
    told = false;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  };
  const onMove = (e: TouchEvent) => {
    if (told || e.touches.length !== 1 || map.dragging.enabled()) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - x0) + Math.abs(t.clientY - y0) < SLOP) return;
    told = true;
    onOneFinger();
  };
  const onEnd = (e: TouchEvent) => { if (e.touches.length === 0) told = false; };

  // Passive throughout: this listener must never be able to hold up a scroll.
  const opts = { passive: true };
  container.addEventListener("touchstart", onStart, opts);
  container.addEventListener("touchmove", onMove, opts);
  container.addEventListener("touchend", onEnd, opts);
  container.addEventListener("touchcancel", onEnd, opts);

  return () => {
    container.removeEventListener("touchstart", onStart);
    container.removeEventListener("touchmove", onMove);
    container.removeEventListener("touchend", onEnd);
    container.removeEventListener("touchcancel", onEnd);
  };
}
