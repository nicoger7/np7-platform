import { useEffect, useRef } from "react";
import { ADD_SPOT_ANCHOR, ADD_SPOT_OPEN_EVENT } from "@/lib/spotguide-nudge";

/**
 * Opening the add-a-spot form from outside it (Nico, 6 Oct 2026).
 *
 * The welcome strip ("Add your home spot") and /spotguide#sg-add-spot (the
 * member home's setup step) both want the form open, not just in view. They
 * used to press the form's first button. That only worked while the closed
 * form was a single button: once a spot is in, the first button can be "Open my
 * spot", and a rider asking for a form was sent to the spot they had just
 * added. So they ask now, with an event, and the form decides what opening
 * means in whatever state it is in. Nothing is pressed on the rider's behalf.
 */

/**
 * Ask the form on this page to open, then bring it into view.
 * Returns false when this page has no form, so the caller can go to one.
 */
export function openAddSpotForm(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.getElementById(ADD_SPOT_ANCHOR);
  if (!root) return false;
  window.dispatchEvent(new Event(ADD_SPOT_OPEN_EVENT));
  requestAnimationFrame(() => root.scrollIntoView({ behavior: "smooth", block: "start" }));
  return true;
}

/** Call `open` whenever something asks the form to open. Returns the unsubscribe. */
export function onAddSpotOpenRequest(open: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = () => open();
  window.addEventListener(ADD_SPOT_OPEN_EVENT, on);
  return () => window.removeEventListener(ADD_SPOT_OPEN_EVENT, on);
}

/** The form's side, as a hook. `open` may change every render; the newest one runs. */
export function useAddSpotOpenRequest(open: () => void) {
  const latest = useRef(open);
  useEffect(() => { latest.current = open; });
  useEffect(() => onAddSpotOpenRequest(() => latest.current()), []);
}
