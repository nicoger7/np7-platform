import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  // Allow the local preview (loads via 127.0.0.1) to fetch dev /_next resources;
  // Next 16 otherwise trusts only "localhost" and blocks the client bundle,
  // which silently breaks hydration in the preview.
  allowedDevOrigins: ["127.0.0.1"],
};

// Wrap with Vercel BotID so the registration form (and other protected routes)
// can be verified server-side. Invisible to real users; checks run on Vercel.
export default withBotId(nextConfig);
