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
  // form fields and images have no text content — their placeholder/alt is the
  // label a human recognises ("input.w-full" tells nobody anything)
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const hint = el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("type");
    if (hint) return `${tag} "${hint.trim().slice(0, 40)}"`;
  }
  if (tag === "img") {
    const alt = el.getAttribute("alt");
    if (alt) return `img "${alt.trim().slice(0, 40)}"`;
  }
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

/* ── Who gets counted ──────────────────────────────────────────────────────
   Two gates on top of consent, both of which have to pass:

   1. HOST. NEXT_PUBLIC_SITE_URL is set on Vercel's *Production* scope only, so
      preview deploys and `npm run dev` fall back to the literal below and can
      never match their own hostname. Until this existed, every dev session and
      preview URL wrote into the live dataset — which is how /hardware collected
      572 events from 3 "visitors" on a section that 404s in production.

   2. OPT-OUT. The team excludes their own browser once and for good by visiting
      /?np7_notrack=1 — https://www.np-seven.com/?np7_notrack=1 — and undoes it
      with ?np7_notrack=0. It is remembered in localStorage AND in a 10-year
      cookie: conversion events (reserve_start, register, …) call track() from
      their own components and never pass through this file, so /api/track reads
      that cookie server-side and drops them there. One visit covers the site.  */

const NOTRACK = "np7_notrack";

function hostOf(url: string | undefined, fallback: string): string {
  try { return new URL(url || fallback).hostname.toLowerCase(); } catch { return fallback; }
}
const PROD_HOST = hostOf(process.env.NEXT_PUBLIC_SITE_URL, "www.np-seven.com");

/** np-seven.com and www.np-seven.com are one site — the apex 308s to the www. */
const bare = (h: string) => h.replace(/^www\./, "");

function optedOut(): boolean {
  try {
    if (localStorage.getItem(NOTRACK) === "1") return true;
  } catch { /* private mode — fall through to the cookie */ }
  return /(?:^|;\s*)np7_notrack=1/.test(document.cookie);
}

/** localStorage is the durable record; the cookie is how the opt-out reaches the server. */
function setOptOut(on: boolean): void {
  try {
    if (on) localStorage.setItem(NOTRACK, "1");
    else localStorage.removeItem(NOTRACK);
  } catch { /* the cookie alone still does the job */ }
  document.cookie = `${NOTRACK}=${on ? "1" : ""}; path=/; max-age=${on ? 60 * 60 * 24 * 3650 : 0}; SameSite=Lax`;
}

/**
 * Should this event be recorded at all? Staff /admin is internal tooling, not
 * customer behaviour, so it's excluded; the public site AND the member portal
 * count (b6124f7 — the portal is deliberately measured).
 */
function excluded(path: string): boolean {
  if (typeof window === "undefined") return true;
  if (bare(window.location.hostname.toLowerCase()) !== bare(PROD_HOST)) return true;
  if (optedOut()) return true;
  return /^\/admin/.test(path);
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

  // Consume ?np7_notrack=1|0. Declared first so every gate below already sees
  // the stored flag on this very page load; re-arms the cookie from
  // localStorage when only the cookie was cleared.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get(NOTRACK);
    if (q === "1" || q === "0") setOptOut(q === "1");
    else if (optedOut()) setOptOut(true);
  }, [pathname]);

  // Pageview on navigation.
  useEffect(() => {
    if (excluded(pathname)) return;
    trackPageview();
  }, [pathname]);

  // Capture the page when consent is granted mid-visit.
  useEffect(() => {
    const onConsent = () => { if (!excluded(window.location.pathname)) trackPageview(); };
    window.addEventListener("np7-consent", onConsent);
    return () => window.removeEventListener("np7-consent", onConsent);
  }, []);

  // Scroll depth — fire 50% and 90% once each, reset on route change.
  useEffect(() => {
    if (excluded(pathname)) return;
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
      if (excluded(window.location.pathname)) return;
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
  // click but nothing happens (dead clicks). Capped per page so it can never
  // flood. Targets are coarse labels — no PII.
  useEffect(() => {
    if (excluded(pathname)) return;
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

      // rage: 3+ clicks within 800ms inside a ~40px radius. Form fields are
      // exempt — double/triple-clicking to select text in an input is normal
      // behaviour, not frustration (it was our #1 false positive).
      const inField = !!el.closest("input,textarea,select,[contenteditable=true]");
      const now = Date.now();
      recent.push({ t: now, x: e.clientX, y: e.clientY });
      recent = recent.filter((r) => now - r.t < 800);
      if (!inField && recent.length >= 3 && now - lastRage > 1500 && rages < 15) {
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
    if (prev.path && prev.path !== pathname && !prev.sent && !excluded(prev.path)) {
      const secs = Math.round((now - prev.t) / 1000);
      if (secs >= 2 && secs <= 1800) track("page_time", { seconds: secs, p: prev.path });
    }
    stayRef.current = { path: pathname, t: now, sent: false };
  }, [pathname]);
  useEffect(() => {
    const flush = () => {
      const cur = stayRef.current;
      if (cur.sent || !cur.path || excluded(cur.path)) return;
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
