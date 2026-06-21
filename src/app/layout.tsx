import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/shared/cookie-consent";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
