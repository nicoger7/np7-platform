"use client";

import { InstallPrompt } from "./install-prompt";
import type { InstallTheme } from "./install-types";

// Member front-end install suggestion, themed to the active world. Mounted from
// PortalChrome so it follows the same Experience/Hardware tone as the header.
const THEMES: Record<"experience" | "hardware", InstallTheme> = {
  experience: {
    accent: "#0aa3c7",
    accentText: "#ffffff",
    surface: "#012b3a",
    surfaceText: "#ffffff",
    surfaceMuted: "rgba(255,255,255,0.62)",
    border: "rgba(255,255,255,0.12)",
  },
  hardware: {
    accent: "#c2ff38",
    accentText: "#0a0a0a",
    surface: "#0b0b0c",
    surfaceText: "#ffffff",
    surfaceMuted: "rgba(255,255,255,0.55)",
    border: "rgba(255,255,255,0.12)",
  },
};

export function MemberInstallPrompt({ env }: { env: "experience" | "hardware" }) {
  return (
    <InstallPrompt
      storageKey="member"
      appName="NP7"
      tagline="Open NP7 like an app — your trips & level, one tap away"
      iconSrc="/icons/icon-192.png"
      theme={THEMES[env]}
    />
  );
}
