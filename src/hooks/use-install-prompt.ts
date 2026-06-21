"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  bumpViews,
  isDismissed,
  isIOSSafari,
  isStandalone,
  setDismissed,
} from "@/lib/pwa/install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Drives an "add to home screen" suggestion for one NP7 app.
 *
 * @param key       storage namespace — "member" or "admin"
 * @param threshold page views before we suggest (default 3)
 *
 * Returns `eligible` once: not already installed, not previously dismissed,
 * the view threshold is met, and we either captured a native prompt (Android/
 * desktop) or we're on iOS Safari (instructions path).
 */
export function useInstallPrompt(key: string, threshold = 3) {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosSafari, setIosSafari] = useState(false);
  // Optimistic defaults keep the banner hidden until we've actually checked,
  // so it never flashes for installed/dismissed users.
  const [standalone, setStandalone] = useState(true);
  const [dismissed, setDismissedState] = useState(true);
  const [views, setViews] = useState(0);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIosSafari(isIOSSafari());
    setDismissedState(isDismissed(key));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stash it; we'll trigger the dialog on our own CTA
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDismissed(key);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [key]);

  // Count each distinct page view in this app's area.
  useEffect(() => {
    if (!pathname) return;
    setViews(bumpViews(key, pathname));
  }, [key, pathname]);

  const dismiss = useCallback(() => {
    setDismissed(key);
    setDismissedState(true);
  }, [key]);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setDismissed(key); // accepted or not, don't ask again
    setDismissedState(true);
    if (outcome === "accepted") setInstalled(true);
    return outcome === "accepted";
  }, [deferred, key]);

  const canPromptNative = !!deferred;
  const eligible =
    !standalone &&
    !installed &&
    !dismissed &&
    views >= threshold &&
    (canPromptNative || iosSafari);

  return { eligible, iosSafari, canPromptNative, promptInstall, dismiss };
}
