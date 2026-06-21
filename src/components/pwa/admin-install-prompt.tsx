"use client";

import { InstallPrompt } from "./install-prompt";
import type { InstallTheme } from "./install-types";

// Admin install suggestion. Mounted inside AdminShell, so it rides the live
// admin design tokens (cyan for Experience, lime for Hardware, etc.) and only
// ever renders for a logged-in team member.
const ADMIN_THEME: InstallTheme = {
  accent: "var(--admin-accent)",
  accentText: "var(--admin-accent-contrast)",
  surface: "var(--admin-surface)",
  surfaceText: "var(--admin-text)",
  surfaceMuted: "var(--admin-text-muted)",
  border: "var(--admin-border-strong)",
};

export function AdminInstallPrompt() {
  return (
    <InstallPrompt
      storageKey="admin"
      appName="NP7 Admin"
      tagline="Open NP7 Admin like an app — bookings & ops in one tap"
      iconSrc="/icons/admin-icon-192.png"
      theme={ADMIN_THEME}
    />
  );
}
