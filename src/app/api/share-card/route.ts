import { NextRequest } from "next/server";
import sharp from "sharp";
import { parse as parseFont, type Font } from "opentype.js";
import { getPortalUser } from "@/lib/auth";

export const runtime = "nodejs";

// Only our own media hosts — never fetch an arbitrary URL (SSRF guard).
const ALLOWED = /^https:\/\/(media\.np-seven\.com|qfdqigumjadvrocxjolx\.supabase\.co)\//;

/**
 * Text is drawn as vector <path> (via opentype.js), NOT as SVG <text>. Vercel's
 * serverless runtime has no system fonts, and its sharp/librsvg build does not
 * honour embedded @font-face — so <text> renders nothing there (it only worked on
 * a Mac locally). Converting glyphs to outlines needs zero font support from the
 * renderer, so it's bulletproof on any platform. Poppins TTFs live on our CDN and
 * are parsed once per warm instance.
 */
const FONT_BASE = "https://media.np-seven.com/fonts";
let _fonts: Promise<{ head: Font; body: Font; ital: Font }> | null = null;
function loadFonts() {
  if (!_fonts) {
    const grab = async (f: string) => {
      const r = await fetch(`${FONT_BASE}/${f}`, { signal: AbortSignal.timeout(8000) });
      return parseFont(await r.arrayBuffer());
    };
    _fonts = Promise.all([grab("poppins-extrabold.ttf"), grab("poppins-semibold.ttf"), grab("poppins-semibolditalic.ttf")])
      .then(([head, body, ital]) => ({ head, body, ital }))
      .catch((e) => { _fonts = null; throw e; }); // let the next request retry
  }
  return _fonts;
}

// Drop glyphs the font doesn't have (e.g. emoji) so they don't render as .notdef
// boxes — outlines can't fall back to a colour-emoji font the way <text> can.
const clean = (font: Font, s: string) => [...s].filter((ch) => ch === " " || font.charToGlyphIndex(ch) > 0).join("").replace(/\s+/g, " ").trim();

// opentype.js v2's toPathData() emits NaN tokens for some glyph runs (serializer
// bug — the command list itself is clean). librsvg silently stops drawing a path
// at the first bad token, truncating the text mid-word. So serialize the commands
// ourselves — four command types, fully deterministic.
const rnd = (n: number) => Math.round(n * 100) / 100;
const pathData = (p: { commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }> }) =>
  p.commands.map((c) =>
    c.type === "M" ? `M${rnd(c.x!)} ${rnd(c.y!)}` :
    c.type === "L" ? `L${rnd(c.x!)} ${rnd(c.y!)}` :
    c.type === "Q" ? `Q${rnd(c.x1!)} ${rnd(c.y1!)} ${rnd(c.x!)} ${rnd(c.y!)}` :
    c.type === "C" ? `C${rnd(c.x1!)} ${rnd(c.y1!)} ${rnd(c.x2!)} ${rnd(c.y2!)} ${rnd(c.x!)} ${rnd(c.y!)}` : "Z"
  ).join("");

/** A line of text as an SVG <path>. Returns the markup + measured width. */
function tp(font: Font, raw: string, x: number, y: number, size: number, fill: string,
  o: { opacity?: number; anchor?: "start" | "middle"; tracking?: number } = {}) {
  const text = clean(font, raw);
  if (!text) return { svg: "", width: 0 };
  const tracking = o.tracking ?? 0;
  const width = font.getAdvanceWidth(text, size) + tracking * Math.max(0, [...text].length - 1);
  const sx = o.anchor === "middle" ? x - width / 2 : x;
  let d = "";
  if (tracking) {
    let cx = sx;
    for (const ch of text) { d += pathData(font.getPath(ch, cx, y, size)) + " "; cx += font.getAdvanceWidth(ch, size) + tracking; }
  } else {
    d = pathData(font.getPath(text, sx, y, size));
  }
  const op = o.opacity != null ? ` fill-opacity="${o.opacity}"` : "";
  return { svg: `<path d="${d}" fill="${fill}"${op}/>`, width };
}

/**
 * Branded, shareable "story card" from a member's trip photo — the photo under a
 * brand gradient with the colourful NP7 Experience logo, a sticker-style caption,
 * and the trip title/dates. Composited server-side (sharp) so it's pixel-consistent
 * and dodges any client canvas/CORS issues.
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
  const title = (sp.get("title") || "NP7 Experience").trim().slice(0, 64); // wrap/ellipsis below guarantees fit
  const sub = (sp.get("sub") || "").trim().slice(0, 64);
  const caption = (sp.get("caption") || "").trim().replace(/\s+/g, " ").slice(0, 42);
  const showTitle = sp.get("showTitle") !== "0";
  const format = sp.get("format") || "story";
  const { W, H } = format === "square" ? { W: 1080, H: 1080 } : format === "post" ? { W: 1080, H: 1350 } : { W: 1080, H: 1920 };
  if (!ALLOWED.test(photo)) return new Response("bad photo", { status: 400 });

  // Story safe zones: Instagram overlays ~250px of UI at the top (profile, close)
  // and ~310px at the bottom (reply bar) of a 1080x1920 story. Keep every element
  // inside those margins so nothing hides under the app chrome. Feed formats have
  // no overlay, so no inset.
  const SAFE = format === "story" ? { top: 250, bottom: 270 } : { top: 0, bottom: 0 };
  const B = H - SAFE.bottom; // baseline anchor for the bottom text block

  try {
    const [imgRes, fonts] = await Promise.all([
      fetch(photo, { signal: AbortSignal.timeout(9000) }),
      loadFonts(),
    ]);
    if (!imgRes.ok) return new Response("photo unavailable", { status: 502 });
    const base = await sharp(Buffer.from(await imgRes.arrayBuffer())).rotate().resize(W, H, { fit: "cover" }).toBuffer();
    const { head, body } = fonts;

    // Title — guaranteed to fit: shrink a little first, then wrap onto two balanced
    // lines, shrink again, and (last resort) ellipsis-truncate. Long experience names
    // ("NP7 Signature EXP - Mauritius & Madagascar") must never leave the frame.
    const maxW = W - 150;
    const fitsW = (t: string, s: number) => head.getAdvanceWidth(t, s) <= maxW;
    const ell = (t: string, s: number) => { if (fitsW(t, s)) return t; let x = t; while (x.length > 1 && !fitsW(x.trimEnd() + "…", s)) x = x.slice(0, -1); return x.trimEnd() + "…"; };
    const cleanTitle = clean(head, title);
    let titleSize = 94;
    let titleLines: string[] = [cleanTitle];
    if (showTitle) {
      while (titleSize > 64 && !fitsW(cleanTitle, titleSize)) titleSize -= 2;
      if (!fitsW(cleanTitle, titleSize)) {
        // split at the word boundary that balances the two lines best
        const words = cleanTitle.split(" ");
        let best: [string, string] = [cleanTitle, ""]; let bestDiff = Infinity;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
          const diff = Math.abs(head.getAdvanceWidth(a, 60) - head.getAdvanceWidth(b, 60));
          if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
        }
        titleLines = best[1] ? best : [best[0]];
        titleSize = 72;
        while (titleSize > 46 && !titleLines.every((l) => fitsW(l, titleSize))) titleSize -= 2;
        titleLines = titleLines.map((l) => ell(l, titleSize));
      }
    }
    const lineH = Math.round(titleSize * 1.08);
    // last line keeps the B-210 baseline so the wave/dates/footer stay anchored;
    // extra lines stack upward.
    const titleEls = showTitle ? titleLines.map((ln, i) => tp(head, ln, 70, B - 210 - (titleLines.length - 1 - i) * lineH, titleSize, "#ffffff")) : [];
    const titleSvg = titleEls.map((e) => e.svg).join("");
    const titleWidth = titleEls.length ? Math.max(...titleEls.map((e) => e.width)) : 0;
    const titleBlockH = showTitle ? titleSize + (titleLines.length - 1) * lineH : 0;

    // Hand-drawn wave underline (echoes the Experience logo's wave), sized to the title.
    const uw = showTitle ? Math.min(W - 148, Math.max(170, Math.round(titleWidth))) : 0;
    const wavePath = (() => {
      if (!showTitle) return "";
      const x0 = 74, y = B - 176, humps = 3, amp = 9, seg = uw / humps;
      let d = `M ${x0} ${y}`;
      for (let i = 0; i < humps; i++) d += ` Q ${x0 + seg * i + seg / 2} ${y + (i % 2 ? amp : -amp)} ${x0 + seg * (i + 1)} ${y}`;
      return `<path d="${d}" fill="none" stroke="url(#bar)" stroke-width="8" stroke-linecap="round"/>`;
    })();

    const subEl = showTitle && sub ? tp(body, sub, 76, B - 132, 42, "#ffffff", { opacity: 0.9 }) : { svg: "", width: 0 };
    const footEl = tp(body, "np-seven.com", 76, B - 62, 29, "#ffffff", { opacity: 0.62, tracking: 3 });

    // Caption → tilted, Instagram-style gradient "sticker" near the top. Fit + measure so
    // the pill hugs the text exactly.
    const capText = clean(head, caption);
    let capBlock = "";
    if (capText) {
      let capSize = 46;
      const maxTextW = W - 220;
      while (capSize > 28 && head.getAdvanceWidth(capText, capSize) > maxTextW) capSize -= 2;
      const capTextW = head.getAdvanceWidth(capText, capSize);
      const capW = Math.round(capTextW) + 78;
      const capH = capSize + 36;
      // Centre the sticker just below the top safe zone (profile pic / close button).
      const cx = W / 2, cy = Math.max(Math.round(H * 0.16), SAFE.top + Math.round(capH / 2) + 28);
      const cap = tp(head, capText, cx, cy + capSize * 0.34, capSize, "#ffffff", { anchor: "middle" });
      capBlock = `<g transform="rotate(-4.5 ${cx} ${cy})">
        <rect x="${cx - capW / 2 + 4}" y="${cy - capH / 2 + 8}" width="${capW}" height="${capH}" rx="${capH / 2}" fill="#001018" fill-opacity="0.28"/>
        <rect x="${cx - capW / 2}" y="${cy - capH / 2}" width="${capW}" height="${capH}" rx="${capH / 2}" fill="url(#bar)" stroke="#ffffff" stroke-width="3"/>
        ${cap.svg}
      </g>`;
    }

    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
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
      ${capBlock}
      ${titleSvg}
      ${wavePath}
      ${subEl.svg}
      ${footEl.svg}
    </svg>`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
    // The colourful "NP7 Experience" world logo (from the home-page selector) — already
    // full-colour on transparent, so composite as-is above the title.
    try {
      const logoRes = await fetch(`${req.nextUrl.origin}/cdn/assets/logos/np7-experience-logo.png`, { signal: AbortSignal.timeout(5000) });
      if (logoRes.ok) {
        const logoH = 118;
        const logo = await sharp(Buffer.from(await logoRes.arrayBuffer())).resize({ height: logoH }).png().toBuffer();
        layers.push({ input: logo, top: B - 214 - titleBlockH - logoH - 18, left: 72 });
      }
    } catch { /* title still carries the card */ }

    const out = await sharp(base).composite(layers).jpeg({ quality: 88 }).toBuffer();
    return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("error", { status: 500 });
  }
}
