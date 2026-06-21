"use client";

import { useEffect, useState } from "react";

const KEY = "np7_consent";                     // marker that a choice was made + summary
const ANALYTICS_KEY = "np7_consent_analytics"; // "yes" | "no"
const MARKETING_KEY = "np7_consent_marketing"; // "yes" | "no"  (read by the Meta Pixel)

/** Read the stored analytics consent (client-only). Analytics must check this. */
export function hasAnalyticsConsent(): boolean {
  try {
    const a = localStorage.getItem(ANALYTICS_KEY);
    if (a != null) return a === "yes";
    // Back-compat with the old binary banner: "all" granted analytics (not marketing).
    return localStorage.getItem(KEY) === "all";
  } catch {
    return false;
  }
}

function persist(analytics: boolean, marketing: boolean) {
  try {
    localStorage.setItem(KEY, analytics && marketing ? "all" : analytics || marketing ? "custom" : "essential");
    localStorage.setItem(ANALYTICS_KEY, analytics ? "yes" : "no");
    localStorage.setItem(MARKETING_KEY, marketing ? "yes" : "no");
    localStorage.setItem(`${KEY}_at`, new Date().toISOString());
  } catch {
    /* storage blocked */
  }
  // Trackers re-check the stored flags on this event; the payload is just a hint.
  window.dispatchEvent(new CustomEvent("np7-consent", { detail: { analytics, marketing } }));
}

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} className="w-full flex items-start gap-3 text-left py-2">
      <span className={`mt-0.5 shrink-0 w-9 h-5 rounded-full transition-colors relative ${on ? "bg-[#5fd0e8]" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="flex-1">
        <span className="block text-[12.5px] font-bold text-white">{label}</span>
        <span className="block text-[11.5px] text-white/65 leading-snug">{desc}</span>
      </span>
    </button>
  );
}

/**
 * Cookie-consent banner. Privacy-first + GDPR-granular: essential always runs;
 * analytics and marketing are each a separate opt-in (default OFF), and rejecting
 * is as easy as accepting. The choice is stored locally and broadcast via the
 * `np7-consent` event so the first-party tracker and the Meta Pixel can start/stop.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked — don't nag */
    }
  }, []);

  const acceptAll = () => { persist(true, true); setShow(false); };
  const rejectAll = () => { persist(false, false); setShow(false); };
  const saveChoices = () => { persist(analytics, marketing); setShow(false); };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto max-w-[760px] mx-auto rounded-2xl bg-[#00374a] text-white shadow-[0_12px_40px_rgba(0,0,0,0.3)] border border-white/10 p-4 sm:p-5">
        <p className="text-[13px] leading-relaxed text-white/85">
          We use essential cookies to run the site. With your consent we also measure how the site is
          used (first-party, no ad networks) and — only if you choose — use marketing cookies like the
          Meta Pixel to make our ads more relevant.{" "}
          <a href="/privacy" className="font-semibold text-[#5fd0e8] hover:underline">Privacy policy</a>
        </p>

        {customize && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
            <div className="flex items-start gap-3 py-2 opacity-70">
              <span className="mt-0.5 shrink-0 w-9 h-5 rounded-full bg-[#5fd0e8]/40 relative"><span className="absolute top-0.5 left-[18px] w-4 h-4 rounded-full bg-white/80" /></span>
              <span className="flex-1">
                <span className="block text-[12.5px] font-bold text-white">Essential <span className="font-normal text-white/55">· always on</span></span>
                <span className="block text-[11.5px] text-white/65 leading-snug">Sign-in session, your section preference and your cookie choice.</span>
              </span>
            </div>
            <Toggle on={analytics} onChange={setAnalytics} label="Analytics" desc="First-party measurement of pages and the booking funnel. No third-party tools." />
            <Toggle on={marketing} onChange={setMarketing} label="Marketing" desc="Meta (Facebook) Pixel — shares your actions with Meta to measure & target our ads." />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3.5 sm:justify-end">
          <button onClick={rejectAll} className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white/80 bg-white/10 hover:bg-white/15 transition-colors">
            Reject non-essential
          </button>
          {customize ? (
            <button onClick={saveChoices} className="px-5 py-2 rounded-full text-[12.5px] font-bold text-[#00374a] bg-white/90 hover:bg-white transition-colors">
              Save my choices
            </button>
          ) : (
            <button onClick={() => setCustomize(true)} className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white/80 bg-white/10 hover:bg-white/15 transition-colors">
              Customize
            </button>
          )}
          <button onClick={acceptAll} className="px-5 py-2 rounded-full text-[12.5px] font-bold text-[#00374a] bg-[#5fd0e8] hover:bg-[#7fe0f5] transition-colors">
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
