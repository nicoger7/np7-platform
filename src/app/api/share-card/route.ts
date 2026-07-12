import { NextRequest } from "next/server";
import sharp from "sharp";
import { getPortalUser } from "@/lib/auth";

export const runtime = "nodejs";

// Only our own media hosts — never fetch an arbitrary URL (SSRF guard).
const ALLOWED = /^https:\/\/(media\.np-seven\.com|qfdqigumjadvrocxjolx\.supabase\.co)\//;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Branded, shareable 9:16 "story card" from a member's trip photo — the photo
 * under a brand gradient with the NP7 Experience lockup + trip title/dates, so a
 * rider can post it straight to their story/feed. Composited server-side (sharp)
 * so it's pixel-consistent and dodges any client canvas/CORS issues.
 *
 * GET /api/share-card?photo=<our-media-url>&title=&sub=
 */
export async function GET(req: NextRequest) {
  // Members only — the share button lives in a logged-in member's gallery. Stops
  // the (CPU-heavy) generator being hammered by anonymous traffic.
  const user = await getPortalUser().catch(() => null);
  if (!user) return new Response("sign in", { status: 401 });

  const sp = req.nextUrl.searchParams;
  const photo = sp.get("photo") || "";
  const title = (sp.get("title") || "NP7 Experience").trim().slice(0, 42);
  const sub = (sp.get("sub") || "").trim().slice(0, 64);
  if (!ALLOWED.test(photo)) return new Response("bad photo", { status: 400 });

  const W = 1080, H = 1920;
  try {
    const imgRes = await fetch(photo, { signal: AbortSignal.timeout(9000) });
    if (!imgRes.ok) return new Response("photo unavailable", { status: 502 });
    const base = await sharp(Buffer.from(await imgRes.arrayBuffer())).rotate().resize(W, H, { fit: "cover" }).toBuffer();

    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.40" stop-color="#001a24" stop-opacity="0"/>
          <stop offset="1" stop-color="#001a24" stop-opacity="0.94"/>
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffc42e"/><stop offset="0.5" stop-color="#f47b20"/><stop offset="1" stop-color="#00afdb"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="12" fill="url(#bar)"/>
      <rect x="0" y="${Math.round(H * 0.42)}" width="${W}" height="${Math.round(H * 0.58)}" fill="url(#scrim)"/>
      <text x="72" y="${H - 322}" fill="#ffd97a" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="7">✦ NP7 EXPERIENCE</text>
      <text x="70" y="${H - 214}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="98" font-weight="800" letter-spacing="-2">${esc(title)}</text>
      ${sub ? `<text x="72" y="${H - 150}" fill="#ffffff" fill-opacity="0.88" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="600">${esc(sub)}</text>` : ""}
      <text x="72" y="${H - 66}" fill="#ffffff" fill-opacity="0.6" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" letter-spacing="3">np-seven.com</text>
    </svg>`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
    // NP7 wordmark (the PNG is dark → invert to white for the dark card). Best-effort.
    try {
      const logoRes = await fetch(`${req.nextUrl.origin}/cdn/assets/logos/np7-logo.png`, { signal: AbortSignal.timeout(5000) });
      if (logoRes.ok) {
        const logo = await sharp(Buffer.from(await logoRes.arrayBuffer())).resize({ height: 60 }).negate({ alpha: false }).png().toBuffer();
        layers.push({ input: logo, top: 66, left: 72 });
      }
    } catch { /* text lockup already brands it */ }

    const out = await sharp(base).composite(layers).jpeg({ quality: 88 }).toBuffer();
    return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response("error", { status: 500 });
  }
}
