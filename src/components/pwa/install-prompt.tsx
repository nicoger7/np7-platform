"use client";

import { useState } from "react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { InstallBanner } from "./install-banner";
import { InstallIosModal } from "./install-ios-modal";
import type { InstallTheme } from "./install-types";

/**
 * Self-contained "add to home screen" suggestion for one NP7 app. Renders
 * nothing until the user is eligible (see useInstallPrompt): not already
 * installed, not dismissed, and past the view threshold.
 *
 * - Android / desktop: CTA fires the native install dialog.
 * - iOS Safari: CTA opens step-by-step instructions (Share → Add to Home Screen).
 */
export function InstallPrompt({
  storageKey,
  appName,
  tagline,
  iconSrc,
  theme,
  threshold = 3,
}: {
  storageKey: string;
  appName: string;
  tagline: string;
  iconSrc: string;
  theme: InstallTheme;
  threshold?: number;
}) {
  const { eligible, iosSafari, promptInstall, dismiss } = useInstallPrompt(storageKey, threshold);
  const [showIos, setShowIos] = useState(false);

  if (!eligible) return null;

  const onInstall = () => {
    if (iosSafari) setShowIos(true);
    else void promptInstall();
  };

  return (
    <>
      <InstallBanner
        appName={appName}
        tagline={tagline}
        iconSrc={iconSrc}
        ctaLabel={iosSafari ? "How to" : "Install"}
        theme={theme}
        onInstall={onInstall}
        onDismiss={dismiss}
      />
      {showIos && (
        <InstallIosModal
          appName={appName}
          theme={theme}
          onClose={() => {
            setShowIos(false);
            dismiss(); // they've seen the steps; don't keep nagging
          }}
        />
      )}
    </>
  );
}
