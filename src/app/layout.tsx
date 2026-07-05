import type { Metadata, Viewport } from "next";
import { Inter, Anton } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/shared/cookie-consent";
import { AnalyticsTracker } from "@/components/analytics/tracker";
import { MetaPixel } from "@/components/analytics/meta-pixel";

const inter = Inter({
  subsets: ["latin"],
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
    default: "NP7 — Nico Prien | GER-7",
    template: "%s · NP7",
  },
  description: "Premium watersports travel experiences and custom board engineering by Nico Prien (GER-7).",
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
    title: "NP7 — Nico Prien | GER-7",
    description: "Premium watersports travel experiences and custom board engineering by Nico Prien (GER-7).",
  },
  twitter: {
    card: "summary_large_image",
    title: "NP7 — Nico Prien | GER-7",
    description: "Premium watersports travel experiences and custom board engineering by Nico Prien (GER-7).",
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
    <html lang="en" className={`${inter.variable} ${anton.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        {children}
        <AnalyticsTracker />
        <MetaPixel />
        <CookieConsent />
      </body>
    </html>
  );
}
