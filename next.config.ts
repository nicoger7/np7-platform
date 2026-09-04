import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  // Allow the local preview (loads via 127.0.0.1) to fetch dev /_next resources;
  // Next 16 otherwise trusts only "localhost" and blocks the client bundle,
  // which silently breaks hydration in the preview.
  allowedDevOrigins: ["127.0.0.1"],

  // Two agent sessions share this checkout, and Next 16 allows ONE dev server
  // per dist dir (its lock lives at `${distDir}/lock`). `npm run dev:preview`
  // sets NEXT_DIST_DIR so a second session runs its own isolated dev server
  // instead of killing the other's. Unset → the normal `.next`.
  distDir: process.env.NEXT_DIST_DIR || undefined,

  // Route Supabase Storage through Vercel's edge CDN so assets are cached
  // there and Supabase egress drops to near-zero after the first cache miss.
  async rewrites() {
    return [
      {
        source: '/cdn/:path*',
        destination:
          'https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/:path*',
      },
    ];
  },

  /**
   * Headers the browser needs in order to defend us.
   *
   * The site shipped without any of these, which meant a browser had to guess
   * on every one: whether to keep using https, whether a sniffed content type
   * beats the declared one, whether another site may put our admin in a frame,
   * how much of the URL to leak to a third party. Every guess here is now ours.
   *
   * The CSP is deliberately three directives, not a full policy. A real
   * default-src would have to allow inline styles, YouTube, Supabase, R2, the
   * Meta pixel and Vercel's own scripts, which is most of the internet and
   * protects almost nothing. These three cost nothing and close real doors:
   * nobody can inject a <base> tag to re-point our relative URLs, no plugin
   * content runs, and only we may frame our own pages.
   */
  async headers() {
    const baseline = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
      { key: "Permissions-Policy", value: "browsing-topics=(), interest-cohort=(), payment=(), usb=()" },
    ];
    // Signed-in surfaces: never stored by a shared cache or a back button, and
    // never indexed. Both are dynamic already; this says so out loud.
    const priv = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/:path*", headers: baseline },
      { source: "/admin/:path*", headers: priv },
      { source: "/api/admin/:path*", headers: priv },
      { source: "/account/:path*", headers: priv },
    ];
  },

  // The blog moved up a level — from /experience/blog to the top-level /blog
  // (brand-neutral, spans both worlds). Keep old links and bookmarks working.
  async redirects() {
    return [
      { source: "/experience/blog", destination: "/blog", permanent: true },
      { source: "/experience/blog/:slug", destination: "/blog/:slug", permanent: true },
      // The interactive Spotguide product IS the spotguide — the magazine's
      // old spotguide-articles tab was a confusing duplicate. Send it (and any
      // indexed links) to the real thing.
      { source: "/blog/spotguide", destination: "/spotguide", permanent: true },
    ];
  },
};

// Wrap with Vercel BotID so the registration form (and other protected routes)
// can be verified server-side. Invisible to real users; checks run on Vercel.
export default withBotId(nextConfig);
