"use client";

import { useEffect, useState } from "react";
import type { TaglinePair } from "@/lib/taglines";

/** One number in the visitor's own browser: which line they last saw. */
const KEY = "np7_tagline";

/**
 * The hero headline, different each time you come back.
 *
 * Two halves, because neither alone does the job. The SERVER picks by the
 * hour, so the page stays statically cached and costs nothing extra to serve,
 * and a first-time visitor gets a finished headline in the HTML with no
 * flicker and nothing for search engines to miss. The BROWSER then checks the
 * one number it kept from last time, and only if that is the very line it is
 * looking at does it move on to the next one.
 *
 * So most returns need no swap at all (the hour has usually turned anyway),
 * the swap that does happen is a short cross-fade rather than a jolt, and the
 * same person never sees the same headline twice in a row. No cookie, no IP,
 * nothing about the visitor leaves their machine. IP would have been the
 * obvious hook and is the wrong one: a mobile network hides hundreds of people
 * behind one address, and the same person carries a different one from the
 * sofa than from the office.
 */
export function RotatingTagline({
  pairs,
  startIndex,
  h1ClassName,
  pClassName,
}: {
  pairs: TaglinePair[];
  startIndex: number;
  h1ClassName: string;
  pClassName: string;
}) {
  const [shown, setShown] = useState(startIndex);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const len = pairs.length;
    if (len < 2) return;

    let seen: number | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw !== null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) seen = ((Math.trunc(n) % len) + len) % len;
      }
    } catch {
      // private mode, storage blocked: fall through and just show the server's pick
    }

    /*
     * Walk the list, don't just dodge a repeat. Checking only for a collision
     * with the server's pick made the splash alternate between the first two
     * lines forever, because there the server always starts at 0 and the third
     * headline was unreachable. Stepping from what they last saw visits every
     * line in turn; when that step happens to land on what the server already
     * rendered, there is nothing to swap and no fade.
     */
    const next = seen === null ? startIndex : (seen + 1) % len;
    try { window.localStorage.setItem(KEY, String(next)); } catch { /* nothing to do */ }
    if (next === startIndex) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(next); return; }

    setVisible(false);
    const t = setTimeout(() => { setShown(next); setVisible(true); }, 180);
    return () => clearTimeout(t);
  }, [pairs.length, startIndex]);

  const pair = pairs[shown] ?? pairs[0];
  return (
    <div className={`transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}>
      <h1 className={h1ClassName}>{pair.tagline}</h1>
      {pair.subline ? <p className={pClassName}>{pair.subline}</p> : null}
    </div>
  );
}
