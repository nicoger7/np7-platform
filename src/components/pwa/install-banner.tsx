"use client";

import type { InstallTheme } from "./install-types";

/**
 * The bottom "add to home screen" card. Presentational only — eligibility and
 * the install action are decided by the parent (InstallPrompt).
 */
export function InstallBanner({
  appName,
  tagline,
  iconSrc,
  ctaLabel,
  theme,
  onInstall,
  onDismiss,
}: {
  appName: string;
  tagline: string;
  iconSrc: string;
  ctaLabel: string;
  theme: InstallTheme;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[150] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl p-3 shadow-2xl"
        style={{
          backgroundColor: theme.surface,
          color: theme.surfaceText,
          border: `1px solid ${theme.border}`,
          animation: "np7-install-in 240ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{appName}</p>
          <p className="truncate text-xs" style={{ color: theme.surfaceMuted }}>
            {tagline}
          </p>
        </div>
        <button
          onClick={onInstall}
          className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold"
          style={{ backgroundColor: theme.accent, color: theme.accentText }}
        >
          {ctaLabel}
        </button>
        <button
          onClick={onDismiss}
          aria-label="Not now"
          className="-mr-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ color: theme.surfaceMuted }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <style>{`@keyframes np7-install-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
