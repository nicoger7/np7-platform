"use client";

import type { InstallTheme } from "./install-types";

/**
 * iOS Safari has no programmatic install — this modal walks the user through
 * Share → "Add to Home Screen". Themed to match the calling app.
 */
export function InstallIosModal({
  appName,
  theme,
  onClose,
}: {
  appName: string;
  theme: InstallTheme;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm m-0 sm:m-4 rounded-t-3xl sm:rounded-3xl p-6 pb-8"
        style={{ backgroundColor: theme.surface, color: theme.surfaceText, border: `1px solid ${theme.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold leading-tight">Add {appName} to your Home Screen</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full"
            style={{ color: theme.surfaceMuted }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-1 text-sm" style={{ color: theme.surfaceMuted }}>
          Open it like an app — full screen, one tap from your phone.
        </p>

        <ol className="mt-5 space-y-4">
          <Step n={1} theme={theme}>
            Tap the <strong>Share</strong> button
            <ShareIcon color={theme.accent} />
            in Safari&apos;s toolbar.
          </Step>
          <Step n={2} theme={theme}>
            Scroll down and choose <strong>Add to Home Screen</strong>
            <PlusIcon color={theme.accent} />.
          </Step>
          <Step n={3} theme={theme}>
            Tap <strong>Add</strong> — done. {appName} now lives on your home screen.
          </Step>
        </ol>

        <button
          onClick={onClose}
          className="mt-7 w-full rounded-xl py-3 text-sm font-bold"
          style={{ backgroundColor: theme.accent, color: theme.accentText }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function Step({ n, theme, children }: { n: number; theme: InstallTheme; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
        style={{ backgroundColor: theme.accent, color: theme.accentText }}
      >
        {n}
      </span>
      <span className="text-sm leading-relaxed inline-flex flex-wrap items-center gap-1.5">{children}</span>
    </li>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
      <path d="M12 16V4M12 4 8 8M12 4l4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" className="inline">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
