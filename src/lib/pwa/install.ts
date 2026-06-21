/**
 * PWA "add to home screen" helpers — platform detection, standalone detection,
 * and per-app view counting + dismissal persistence.
 *
 * Two NP7 apps share one origin: the member app (start_url /account) and the
 * admin app (start_url /admin). Each gets its own `key` so dismissals and view
 * counts never bleed across them.
 *
 * Android / desktop Chromium fire `beforeinstallprompt` and we trigger the
 * native install dialog. iOS Safari has no such API, so we show instructions
 * (Share → Add to Home Screen). All storage access is wrapped — private mode
 * / disabled storage degrades to "don't nag".
 */

/** Running inside an installed PWA (already on the home screen)? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPhoneIpod = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ masquerades as macOS — detect a touch-capable "Mac"
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iPhoneIpod || iPadOS;
}

/** iOS Safari specifically — Add-to-Home-Screen lives behind the Share sheet here.
 *  In-app browsers (Instagram, etc.) and Chrome/Firefox on iOS can't add to home,
 *  so we don't show the instructions there. */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua);
}

const DISMISS = "np7_pwa_dismissed:";
const VIEWS = "np7_pwa_views:";
const LAST_PATH = "np7_pwa_lastpath:";

export function isDismissed(key: string): boolean {
  try {
    return localStorage.getItem(DISMISS + key) === "1";
  } catch {
    return false;
  }
}

export function setDismissed(key: string): void {
  try {
    localStorage.setItem(DISMISS + key, "1");
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

/** Count a page view for `key`, de-duped per browser session so re-rendering the
 *  same path doesn't inflate it. Returns the new cumulative count. */
export function bumpViews(key: string, path: string): number {
  try {
    if (sessionStorage.getItem(LAST_PATH + key) === path) {
      return parseInt(localStorage.getItem(VIEWS + key) || "0", 10) || 0;
    }
    sessionStorage.setItem(LAST_PATH + key, path);
    const next = (parseInt(localStorage.getItem(VIEWS + key) || "0", 10) || 0) + 1;
    localStorage.setItem(VIEWS + key, String(next));
    return next;
  } catch {
    // No storage → treat as "seen enough" so we never block, but also never nag
    // (eligibility also checks dismissal, which we can't read, so this is inert).
    return 0;
  }
}
