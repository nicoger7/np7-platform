/**
 * Shared between the admin preview UI (client) and the auth guard (server), so
 * neither has to import the other's module — lib/auth pulls in next/headers and
 * cannot be reached from a client component.
 */

/** Cookie naming the contact an admin is previewing. Read server-side only. */
export const VIEW_AS_COOKIE = "np7_view_as";

/**
 * Marker on every URL the preview iframe loads. The cookie alone is ambient —
 * it rides along on every request to the site — so impersonation additionally
 * requires this marker, which normal browsing never carries.
 */
export const PREVIEW_PARAM = "__np7_preview";
