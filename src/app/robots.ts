import type { MetadataRoute } from "next";

/** Crawler rules — private surfaces off-limits, sitemap advertised. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/api/", "/tile-preview"],
      },
    ],
    sitemap: "https://www.np-seven.com/sitemap.xml",
  };
}
