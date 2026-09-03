import type { Metadata, Viewport } from "next";
import { Poppins, Anton } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/shared/cookie-consent";
import { AnalyticsTracker } from "@/components/analytics/tracker";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { SECTION_CSS, SECTION_SCRIPT } from "@/components/shared/section-world";
import { SectionSync } from "@/components/shared/section-sync";

// Body face: Poppins — the brand's rounded, warm "oceany" sans (already the
// share-card font), replacing the techy neutral Inter. Kept on the same CSS
// variable so every downstream rule keeps working.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
});

// Heavy condensed display face for the auto-branded experience tiles
// (the big gold place-name — "ALACATI", "BONAIRE", …).
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const SITE_URL = "https://www.np-seven.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NP7 — Windsurf trips, spots & gear",
    template: "%s · NP7",
  },
  description: "Windsurf coaching trips to the world's best spots, a rider-built spotguide, and custom boards — by Nico Prien.",
  applicationName: "NP7",
  // Member/public PWA: installs to /account. The /admin route group overrides
  // this with its own manifest + icons so the team gets a separate home-screen app.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "NP7", statusBarStyle: "black-translucent" },
  // Favicon = the NP7 wordmark filling the frame (dedicated tab icons, logo trimmed
  // tight so it reads at 16px). The padded PWA/home-screen icons stay in the
  // manifests untouched (they need safe-zone breathing room for masking).
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icons/favicon-96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "NP7",
    url: SITE_URL,
    title: "NP7 — Windsurf trips, spots & gear",
    description: "Windsurf coaching trips to the world's best spots, a rider-built spotguide, and custom boards — by Nico Prien.",
    // Site-wide default share image — pages with their own art (blog covers,
    // destination heroes) override it in their generateMetadata.
    images: [{ url: `${SITE_URL}/cdn/assets/hero/windsurf-hero-poster.jpg`, width: 1920, height: 1080, alt: "NP7 — windsurfing" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NP7 — Windsurf trips, spots & gear",
    description: "Windsurf coaching trips to the world's best spots, a rider-built spotguide, and custom boards — by Nico Prien.",
    images: [`${SITE_URL}/cdn/assets/hero/windsurf-hero-poster.jpg`],
  },
};

export const viewport: Viewport = {
  themeColor: "#012b3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${anton.variable} antialiased`}
      /* SECTION_SCRIPT stamps data-np7-section on <html> before first paint, so
         the attribute React hydrates against is one it never rendered. Same
         deal as a dark-mode theme script — the mismatch is the design. */
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col">
        {/* Both run before any page markup is parsed, so the world-spanning
            pages (Magazine, Spotguide, About) can be cached world-neutral and
            still paint the reader's world on the first frame. */}
        <script dangerouslySetInnerHTML={{ __html: SECTION_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: SECTION_CSS }} />
        {children}
        <SectionSync />
        <AnalyticsTracker />
        <MetaPixel />
        <CookieConsent />
      </body>
    </html>
  );
}
