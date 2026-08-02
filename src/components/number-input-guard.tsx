"use client";

import { useEffect } from "react";

/**
 * Stop the scroll wheel silently editing number fields.
 *
 * Browsers treat a focused `<input type=number>` as a scroll target: put the
 * cursor in a price, scroll the page, and the price changes. No undo, no
 * warning, and you only notice if you happen to look back at the field. On a
 * page of costs and agreed prices that is a real way to lose money.
 *
 * One document-level listener rather than an onWheel on each of ~85 inputs:
 * the fix can't be forgotten on the next field somebody adds.
 *
 * `passive: false` because preventDefault is the whole point, and `capture` so
 * we get there before the input does. Only fires when a number input is
 * actually focused, so normal page scrolling is untouched — including scrolling
 * with the pointer over a field you haven't clicked into.
 */
export function NumberInputGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number" && el === e.target) {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  }, []);
  return null;
}
