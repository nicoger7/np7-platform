import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the local preview (loads via 127.0.0.1) to fetch dev /_next resources;
  // Next 16 otherwise trusts only "localhost" and blocks the client bundle,
  // which silently breaks hydration in the preview.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
