"use client";

import { useEffect, useState } from "react";

const KEY = "np7_consent"; // "all" | "essential"

/** Read the stored analytics consent (client-only). Analytics must check this. */
export function hasAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem(KEY) === "all";
  } catch {
    return false;
  }
}

/**
 * Cookie-consent banner. Privacy-first: nothing non-essential runs until the
 * visitor actively accepts. Stores the choice locally and broadcasts an
 * `np7-consent` event so a future analytics tracker can start/stop. Essential
 * cookies (sign-in session, section preference) always run and need no consent.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked — don't nag */
    }
  }, []);

  const choose = (v: "all" | "essential") => {
    try {
      localStorage.setItem(KEY, v);
      localStorage.setItem(`${KEY}_at`, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setShow(false);
    window.dispatchEvent(new CustomEvent("np7-consent", { detail: v }));
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto max-w-[760px] mx-auto rounded-2xl bg-[#00374a] text-white shadow-[0_12px_40px_rgba(0,0,0,0.3)] border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <p className="text-[13px] leading-relaxed text-white/85 flex-1">
          We use only essential cookies to run the site. With your consent we’d also measure how the site
          is used to improve it — no ads, no third-party tracking.{" "}
          <a href="/privacy" className="font-semibold text-[#5fd0e8] hover:underline">Privacy policy</a>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => choose("essential")}
            className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white/80 bg-white/10 hover:bg-white/15 transition-colors"
          >
            Essential only
          </button>
          <button
            onClick={() => choose("all")}
            className="px-5 py-2 rounded-full text-[12.5px] font-bold text-[#00374a] bg-[#5fd0e8] hover:bg-[#7fe0f5] transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
