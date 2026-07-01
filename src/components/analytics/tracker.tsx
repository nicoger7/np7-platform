"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageview, track } from "@/lib/analytics-client";

// Things that are genuinely clickable — a click landing inside one of these is a
// real interaction, not a dead click.
const INTERACTIVE = "a[href],button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[contenteditable=true],[tabindex]";

/** Short, human-readable label for a clicked element (for the frustration report). */
function describe(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (el.dataset?.track) return `[${el.dataset.track}]`;
  const aria = el.getAttribute?.("aria-label");
  if (aria) return `${tag} "${aria.trim().slice(0, 40)}"`;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return `${tag} "${text.slice(0, 40)}"`;
  if (el.id) return `${tag}#${el.id}`;
  const cls = typeof el.className === "string" ? el.className.split(/\s+/).find((c) => c && !c.includes(":")) : "";
  return cls ? `${tag}.${cls}` : tag;
}

/** Does the element look clickable (pointer cursor) — i.e. the visitor expected something to happen? */
function looksClickable(el: HTMLElement): boolean {
  try { return getComputedStyle(el).cursor === "pointer"; } catch { return false; }
}

/**
 * Behaviour tracking, mounted once in the root layout. All calls go through
 * track(), which self-gates on analytics consent, so nothing fires without it.
 *
 *  - pageview on every route change (+ when consent is granted)
 *  - scroll depth (50% / 90%) once per page
 *  - delegated clicks: any element with a [data-track] attribute fires that event
 *  - interaction: general clicks (what they click), dead clicks (looked clickable,
 *    nothing happened) and rage clicks (frustrated repeat clicking)
 *
 * Reads only the pathname, so it needs no Suspense boundary.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();

  // Pageview on navigation. Staff /admin is internal tooling, not customer
  // behaviour, so it's excluded; the public site AND the member portal count.
  useEffect(() => {
    if (/^\/admin/.test(pathname)) return;
    trackPageview();
  }, [pathname]);

  // Capture the page when consent is granted mid-visit.
  useEffect(() => {
    const onConsent = () => { if (!/^\/admin/.test(window.location.pathname)) trackPageview(); };
    window.addEventListener("np7-consent", onConsent);
    return () => window.removeEventListener("np7-consent", onConsent);
  }, []);

  // Scroll depth — fire 50% and 90% once each, reset on route change. Skipped on
  // internal areas (admin/account) where scroll engagement isn't meaningful.
  useEffect(() => {
    if (/^\/admin/.test(pathname)) return;
    const fired = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = (window.scrollY / max) * 100;
      for (const t of [50, 90]) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          track("scroll_depth", { depth: t });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Delegated click tracking via data attributes:
  //   <button data-track="reserve_cta" data-track-label="hero">…</button>
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-track]") as HTMLElement | null;
      if (!el) return;
      const event = el.dataset.track;
      if (!event) return;
      const meta: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.dataset)) {
        if (k.startsWith("track") && k !== "track" && v) {
          meta[k.slice(5).toLowerCase()] = v;
        }
      }
      track(event, Object.keys(meta).length ? meta : undefined);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Interaction capture: what people click, where they rage-click, and where they
  // click but nothing happens (dead clicks). Skipped on internal areas; capped per
  // page so it can never flood. Targets are coarse labels — no PII.
  useEffect(() => {
    if (/^\/admin/.test(pathname)) return;
    let clicks = 0, deads = 0, rages = 0;
    let recent: { t: number; x: number; y: number }[] = [];
    let lastRage = 0;
    const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100);

    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.tagName) return;
      const xpct = pct(e.clientX, window.innerWidth);
      const ypct = pct(e.clientY, window.innerHeight);
      // page-relative Y (includes scroll) so heatmaps can place clicks on the full page
      const yd = Math.round(((window.scrollY + e.clientY) / Math.max(1, document.documentElement.scrollHeight)) * 100);

      // rage: 3+ clicks within 800ms inside a ~40px radius
      const now = Date.now();
      recent.push({ t: now, x: e.clientX, y: e.clientY });
      recent = recent.filter((r) => now - r.t < 800);
      if (recent.length >= 3 && now - lastRage > 1500 && rages < 15) {
        const near = recent.filter((r) => Math.hypot(r.x - e.clientX, r.y - e.clientY) < 40);
        if (near.length >= 3) { lastRage = now; rages++; recent = []; track("rage_click", { target: describe(el), xpct, ypct, yd }); }
      }

      const interactive = el.closest(INTERACTIVE) as HTMLElement | null;
      if (interactive) {
        // a real interaction — record WHAT they clicked (skip already-tagged CTAs to avoid double-count)
        if (!interactive.closest("[data-track]") && clicks < 80) {
          clicks++;
          track("click", { target: describe(interactive), xpct, ypct, yd });
        }
        return;
      }

      // dead-click candidate: not interactive, but the visitor had reason to expect action
      const expectable = looksClickable(el) || (el.matches?.("img,svg,[role],[data-track]") ?? false);
      if (!expectable || deads >= 25 || el.closest("input,textarea,select,[contenteditable=true]")) return;
      const url = location.href, h = document.documentElement.scrollHeight, sy = window.scrollY;
      let mutated = false;
      const mo = new MutationObserver(() => { mutated = true; });
      mo.observe(document.body, { childList: true, subtree: true, attributes: true });
      window.setTimeout(() => {
        mo.disconnect();
        const changed = location.href !== url || mutated || Math.abs(window.scrollY - sy) > 4 || document.documentElement.scrollHeight !== h;
        if (!changed) { deads++; track("dead_click", { target: describe(el), xpct, ypct, yd }); }
      }, 700);
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [pathname]);

  // Time on page — how long visitors actually stay (the interest signal). Emitted
  // for the page you LEAVE (on route change + when the tab is hidden/closed),
  // attributed to that page via meta.p. Guarded so each visit is counted once.
  const stayRef = useRef<{ path: string; t: number; sent: boolean }>({ path: "", t: 0, sent: false });
  useEffect(() => {
    const prev = stayRef.current;
    const now = Date.now();
    if (prev.path && prev.path !== pathname && !prev.sent && !/^\/admin/.test(prev.path)) {
      const secs = Math.round((now - prev.t) / 1000);
      if (secs >= 2 && secs <= 1800) track("page_time", { seconds: secs, p: prev.path });
    }
    stayRef.current = { path: pathname, t: now, sent: false };
  }, [pathname]);
  useEffect(() => {
    const flush = () => {
      const cur = stayRef.current;
      if (cur.sent || !cur.path || /^\/admin/.test(cur.path)) return;
      const secs = Math.round((Date.now() - cur.t) / 1000);
      if (secs >= 2 && secs <= 1800) { track("page_time", { seconds: secs, p: cur.path }); cur.sent = true; }
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", flush); };
  }, []);

  return null;
}
