import { NextRequest } from "next/server";
import sharp from "sharp";
import { getPortalUser } from "@/lib/auth";

export const runtime = "nodejs";

// Only our own media hosts — never fetch an arbitrary URL (SSRF guard).
const ALLOWED = /^https:\/\/(media\.np-seven\.com|qfdqigumjadvrocxjolx\.supabase\.co)\//;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Fonts are embedded into the SVG as base64 @font-face — Vercel's serverless
 * runtime has NO system fonts, so `font-family="Arial"` renders nothing there
 * (it only worked locally because macOS ships Arial). We host the Poppins TTFs
 * on our own CDN and inline them; sharp's librsvg honours embedded @font-face.
 * Fetched once per warm instance.
 */
const FONT_BASE = "https://media.np-seven.com/fonts";
let _fonts: Promise<{ head: string; body: string; ital: string }> | null = null;
function loadFonts() {
  if (!_fonts) {
    const grab = async (f: string) => {
      const r = await fetch(`${FONT_BASE}/${f}`, { signal: AbortSignal.timeout(8000) });
      return Buffer.from(await r.arrayBuffer()).toString("base64");
    };
    _fonts = Promise.all([
      grab("poppins-extrabold.ttf"),
      grab("poppins-semibold.ttf"),
      grab("poppins-semibolditalic.ttf"),
    ])
      .then(([head, body, ital]) => ({ head, body, ital }))
      .catch((e) => { _fonts = null; throw e; }); // let the next request retry
  }
  return _fonts;
}

/**
 * Branded, shareable "story card" from a member's trip photo — the photo under a
 * brand gradient with the NP7 Experience lockup + trip title/dates, so a rider can
 * post it straight to their story/feed. Composited server-side (sharp) so it's
 * pixel-consistent and dodges any client canvas/CORS issues.
 *
 * GET /api/share-card?photo=<our-media-url>&title=&sub=&caption=&format=story|post|square
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
  const caption = (sp.get("caption") || "").trim().replace(/\s+/g, " ").slice(0, 42);
  const showTitle = sp.get("showTitle") !== "0";
  const format = sp.get("format") || "story";
  const { W, H } = format === "square" ? { W: 1080, H: 1080 } : format === "post" ? { W: 1080, H: 1350 } : { W: 1080, H: 1920 };
  if (!ALLOWED.test(photo)) return new Response("bad photo", { status: 400 });

  try {
    const [imgRes, fonts] = await Promise.all([
      fetch(photo, { signal: AbortSignal.timeout(9000) }),
      loadFonts(),
    ]);
    if (!imgRes.ok) return new Response("photo unavailable", { status: 502 });
    const base = await sharp(Buffer.from(await imgRes.arrayBuffer())).rotate().resize(W, H, { fit: "cover" }).toBuffer();

    // Auto-size the title so long trip names ("South Africa", "Alacati Windweek")
    // never run off the edge. Poppins ExtraBold advances at ~0.60em.
    const titleSize = showTitle ? Math.max(50, Math.min(94, Math.floor(1450 / Math.max(title.length, 1)))) : 0;

    // Bottom text block, anchored from the foot so it works for any aspect ratio.
    // Text uses the embedded Poppins faces (NP7Head/Body/Ital) — see loadFonts().
    // The eyebrow "diamond" is a drawn shape, not a glyph, so it never depends on
    // the font shipping ✦.
    const eyebrowY = H - 322;
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face{font-family:'NP7Head';src:url(data:font/ttf;base64,${fonts.head}) format('truetype');}
          @font-face{font-family:'NP7Body';src:url(data:font/ttf;base64,${fonts.body}) format('truetype');}
          @font-face{font-family:'NP7Ital';src:url(data:font/ttf;base64,${fonts.ital}) format('truetype');}
        </style>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.38" stop-color="#001a24" stop-opacity="0"/>
          <stop offset="1" stop-color="#001a24" stop-opacity="0.94"/>
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffc42e"/><stop offset="0.5" stop-color="#f47b20"/><stop offset="1" stop-color="#00afdb"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="12" fill="url(#bar)"/>
      <rect x="0" y="${Math.round(H * 0.40)}" width="${W}" height="${Math.round(H * 0.60)}" fill="url(#scrim)"/>
      ${caption ? `<text x="72" y="${H - 372}" fill="#ffffff" font-family="NP7Ital" font-size="44">${esc(caption)}</text>` : ""}
      <rect x="72" y="${eyebrowY - 24}" width="15" height="15" fill="#ffd97a" transform="rotate(45 79.5 ${eyebrowY - 16.5})"/>
      <text x="104" y="${eyebrowY}" fill="#ffd97a" font-family="NP7Head" font-size="30" letter-spacing="7">NP7 EXPERIENCE</text>
      ${showTitle ? `<text x="70" y="${H - 214}" fill="#ffffff" font-family="NP7Head" font-size="${titleSize}" letter-spacing="-1">${esc(title)}</text>` : ""}
      ${showTitle && sub ? `<text x="72" y="${H - 150}" fill="#ffffff" fill-opacity="0.88" font-family="NP7Body" font-size="42">${esc(sub)}</text>` : ""}
      <text x="72" y="${H - 66}" fill="#ffffff" fill-opacity="0.62" font-family="NP7Body" font-size="30" letter-spacing="3">np-seven.com</text>
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
