/**
 * Admin access tiers. Pure (no server deps) so it can be imported by the
 * middleware, server components, and the client shell alike.
 *
 * - owner   → full access (finance, company/legal settings, team & payroll).
 * - manager → everything operational, but NOT the owner-only sections below.
 *
 * NULL / unknown levels normalise to "owner" so a not-yet-migrated or
 * unset member is never locked out; the owner downgrades from the Team editor.
 */
export type AccessLevel = "owner" | "manager";

export const ACCESS_LEVELS: AccessLevel[] = ["owner", "manager"];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  owner: "Owner — full access",
  manager: "Manager — no Finance, Settings or Team admin",
};

/** Sections only an Owner may open — pages AND their APIs. */
const OWNER_ONLY = [
  "/admin/payments", "/admin/exp-costs", "/admin/vendors", "/admin/documents",
  "/admin/settings", "/admin/team", "/admin/hours-log", "/admin/analytics",
  "/api/admin/payments", "/api/admin/exp-costs", "/api/admin/vendors", "/api/admin/documents",
  "/api/admin/company-settings", "/api/admin/team", "/api/admin/hours-log", "/api/admin/analytics",
];

export function normalizeLevel(v: unknown): AccessLevel {
  return v === "manager" ? "manager" : "owner";
}

function underPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function isOwnerOnlyPath(path: string): boolean {
  return OWNER_ONLY.some((p) => underPrefix(p, path));
}

/** Whether a member at `level` may access `path` (an /admin or /api/admin path). */
export function canAccess(level: AccessLevel, path: string): boolean {
  if (level === "owner") return true;
  return !isOwnerOnlyPath(path);
}
