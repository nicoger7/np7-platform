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

    // Hand-drawn wave underline (echoes the Experience logo's wave) under the title.
    const wave = (x0: number, y: number, width: number, humps = 3, amp = 9) => {
      const seg = width / humps;
      let d = `M ${x0} ${y}`;
      for (let i = 0; i < humps; i++) d += ` Q ${x0 + seg * i + seg / 2} ${y + (i % 2 ? amp : -amp)} ${x0 + seg * (i + 1)} ${y}`;
      return d;
    };
    const underlineW = showTitle ? Math.min(W - 148, Math.max(170, Math.round(title.length * titleSize * 0.56))) : 0;

    // Caption becomes a tilted, sticker-style gradient pill near the top — playful,
    // Instagram-esque. Auto-fits the text so it never clips.
    const capSize = caption ? Math.max(30, Math.min(46, Math.floor(1560 / Math.max(caption.length, 1)))) : 0;
    const capW = Math.round(caption.length * capSize * 0.58) + 76;
    const capH = capSize + 36;
    const capCx = W / 2;
    const capCy = Math.round(H * 0.16);

    // Bottom text block, anchored from the foot so it works for any aspect ratio.
    // Text uses the embedded Poppins faces (NP7Head/Body/Ital) — see loadFonts().
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face{font-family:'NP7Head';src:url(data:font/ttf;base64,${fonts.head}) format('truetype');}
          @font-face{font-family:'NP7Body';src:url(data:font/ttf;base64,${fonts.body}) format('truetype');}
          @font-face{font-family:'NP7Ital';src:url(data:font/ttf;base64,${fonts.ital}) format('truetype');}
        </style>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.36" stop-color="#001a24" stop-opacity="0"/>
          <stop offset="1" stop-color="#001a24" stop-opacity="0.95"/>
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffc42e"/><stop offset="0.5" stop-color="#f47b20"/><stop offset="1" stop-color="#00afdb"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="10" fill="url(#bar)"/>
      <rect x="0" y="${Math.round(H * 0.38)}" width="${W}" height="${Math.round(H * 0.62)}" fill="url(#scrim)"/>
      ${caption ? `<g transform="rotate(-4.5 ${capCx} ${capCy})">
        <rect x="${capCx - capW / 2 + 4}" y="${capCy - capH / 2 + 8}" width="${capW}" height="${capH}" rx="${capH / 2}" fill="#001018" fill-opacity="0.28"/>
        <rect x="${capCx - capW / 2}" y="${capCy - capH / 2}" width="${capW}" height="${capH}" rx="${capH / 2}" fill="url(#bar)" stroke="#ffffff" stroke-width="3"/>
        <text x="${capCx}" y="${capCy + capSize * 0.35}" text-anchor="middle" fill="#ffffff" font-family="NP7Head" font-size="${capSize}">${esc(caption)}</text>
      </g>` : ""}
      ${showTitle ? `<text x="70" y="${H - 210}" fill="#ffffff" font-family="NP7Head" font-size="${titleSize}" letter-spacing="-1">${esc(title)}</text>` : ""}
      ${showTitle ? `<path d="${wave(76, H - 176, underlineW)}" fill="none" stroke="url(#bar)" stroke-width="8" stroke-linecap="round"/>` : ""}
      ${showTitle && sub ? `<text x="76" y="${H - 132}" fill="#ffffff" fill-opacity="0.9" font-family="NP7Body" font-size="42">${esc(sub)}</text>` : ""}
      <text x="76" y="${H - 62}" fill="#ffffff" fill-opacity="0.62" font-family="NP7Body" font-size="29" letter-spacing="3">np-seven.com</text>
    </svg>`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
    // The colourful "NP7 Experience" world logo (from the home-page selector) — it's
    // already full-colour on transparent, so composite as-is above the title.
    try {
      const logoRes = await fetch(`${req.nextUrl.origin}/cdn/assets/logos/np7-experience-logo.png`, { signal: AbortSignal.timeout(5000) });
      if (logoRes.ok) {
        const logoH = 118;
        const logo = await sharp(Buffer.from(await logoRes.arrayBuffer())).resize({ height: logoH }).png().toBuffer();
        layers.push({ input: logo, top: H - 214 - titleSize - logoH - 18, left: 72 });
      }
    } catch { /* title still carries the card */ }

    const out = await sharp(base).composite(layers).jpeg({ quality: 88 }).toBuffer();
    return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response("error", { status: 500 });
  }
}
