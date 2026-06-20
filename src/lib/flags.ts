/**
 * Surface visibility flags — for a quiet, gradual public launch.
 *
 * Goal: ship the admin panel + the member portal to production now, while the
 * public Experience / Hardware marketing and the member Gear / Cart sections stay
 * INVISIBLE (a plain 404 — no "coming soon", nothing that hints more is coming).
 *
 * Rule (fail-closed in production):
 *   - On Vercel **production**: a surface is hidden unless its env var is "true".
 *   - Everywhere else (preview deploys + local dev): everything is visible, so the
 *     team can keep reviewing work-in-progress.
 *
 * To reveal a surface in production later, set its env var to `true` in Vercel
 * (Production scope) and redeploy — e.g. SHOW_EXPERIENCE=true. No code change.
 *
 * Server-only (reads VERCEL_ENV). Never import this into a client component —
 * pass the resolved boolean down as a prop instead.
 */
const isProd = process.env.VERCEL_ENV === "production";
const on = (v?: string) => v === "true" || v === "1";
const show = (envVal?: string) => !isProd || on(envVal);

export const flags = {
  showExperience: show(process.env.SHOW_EXPERIENCE),
  showHardware: show(process.env.SHOW_HARDWARE),
  showGear: show(process.env.SHOW_GEAR),
  showCart: show(process.env.SHOW_CART),
};
