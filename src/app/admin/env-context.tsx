"use client";

import { createContext, useContext } from "react";

// The active admin world ("environment"). AdminShell's world switcher owns the
// state and provides it here; pages that render per-world content (the
// Dashboard) consume it, so switching worlds re-renders them in place without
// a reload. "magazine" stays a UI-only grouping — see the note in admin-shell.
export type AdminEnv = "experience" | "hardware" | "magazine" | "product-dev" | "analytics";

export const AdminEnvContext = createContext<AdminEnv>("experience");

export function useAdminEnv(): AdminEnv {
  return useContext(AdminEnvContext);
}
