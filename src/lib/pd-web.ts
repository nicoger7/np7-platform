import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { pdAiKey } from "@/lib/pd-ai";

/**
 * The Product Dev side of the open web: fetch a page, pull the product pictures
 * out of it, and the Claude client the research and picture search share.
 *
 * Only route handlers import this (it is server-only). Everything it fetches is
 * a URL an admin typed or a page Claude's web search returned, so it is fenced
 * the way any server-side fetch of a user-supplied URL has to be: http(s) only,
 * public addresses only, every redirect re-checked, a size cap and a timeout.
 */

const UA = "Mozilla/5.0 (compatible; NP7-ProductDev/1.0; +https://www.np-seven.com)";

function privateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  // IPv4 inside IPv6. URL parsing turns [::ffff:127.0.0.1] into [::ffff:7f00:1],
  // so the hex form has to be read back into a dotted quad before checking.
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return privateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  // IPv4-compatible (::a.b.c.d / ::7f00:1) and NAT64 (64:ff9b::/96) forms reach IPv4 too.
  if (/^::[0-9a-f.:]+$/.test(v) && v !== "::1") return true;
  if (v.startsWith("64:ff9b:")) return true;
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8")
    || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https links work here.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && isIP(host) === 0) throw new Error("That is not a public web address.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error("That is not a public web address.");
}

/** GET a public URL, following up to four redirects, each one re-checked. */
export async function safeFetch(raw: string, opts: { maxBytes: number; timeoutMs?: number; accept?: string }): Promise<{ url: string; contentType: string; body: Buffer }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: opts.accept ?? "*/*", "Accept-Language": "en,de;q=0.8" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`${url.hostname} answered ${res.status}.`);
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > opts.maxBytes) throw new Error("That file is too large.");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > opts.maxBytes) { await reader.cancel(); throw new Error("That file is too large."); }
      chunks.push(value);
    }
    return { url: url.toString(), contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new Error("Too many redirects.");
}

// ─── Google image links ──────────────────────────────────────────────────────

// Google's own hosts only: google.com, google.de, google.co.uk, google.com.au,
// www./images. in front, and share.google. Anchored, so "google.evil.example"
// is not Google.
const GOOGLE = /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$|^share\.google$/i;

/**
 * What a Google link points at. share.google/… redirects (twice) to an imgres
 * link, which names the picture (imgurl) and the page it is on (imgrefurl).
 * Only Google's own hosts are followed here; everything else goes through the
 * normal safe fetch.
 */
export async function resolveGoogleImageLink(raw: string): Promise<{ image: string | null; page: string | null } | null> {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  for (let hop = 0; hop < 5 && GOOGLE.test(url.hostname); hop++) {
    const image = url.searchParams.get("imgurl"), page = url.searchParams.get("imgrefurl") ?? url.searchParams.get("url") ?? url.searchParams.get("q");
    if (image || (page && /^https?:\/\//i.test(page))) return { image, page: page && /^https?:\/\//i.test(page) ? page : null };
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    const next = res.headers.get("location");
    if (!next || res.status < 300 || res.status >= 400) return null;
    url = new URL(next, url);
  }
  return GOOGLE.test(url.hostname) ? null : { image: null, page: url.toString() };
}

// ─── Pictures out of a product page ──────────────────────────────────────────

export type ImageCandidate = {
  src: string;
  alt: string | null;
  width: number | null;
  score: number;
  page: string;
};

const JUNK = /(logo|icon|sprite|favicon|placeholder|banner|flag|payment|paypal|visa|mastercard|avatar|facebook|instagram|youtube|tiktok|twitter|linkedin|loader|spinner|arrow|cart|badge|trustpilot|cookie|newsletter|pixel|tracking)/i;
const GOOD_VIEW = /(top|deck|bottom|front|back|board|shape|outline|plan)/i;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? "").replace(/&amp;/g, "&");
  }
  return out;
}

/** The widest entry of a srcset, with its width if the srcset says it. */
function largestFromSrcset(srcset: string): { src: string; width: number | null } | null {
  let best: { src: string; width: number | null } | null = null;
  for (const part of srcset.split(",")) {
    const [src, size] = part.trim().split(/\s+/);
    if (!src) continue;
    const w = size?.endsWith("w") ? Number(size.slice(0, -1)) : size?.endsWith("x") ? Number(size.slice(0, -1)) * 1000 : null;
    if (!best || (w ?? 0) > (best.width ?? 0)) best = { src, width: w };
  }
  return best;
}

/**
 * Every picture a product page offers, best guess first.
 *
 * "Best" is crude on purpose and says so: the brand's own share image and
 * gallery links outrank inline pictures, a file or alt text that names the
 * model or the size outranks one that does not, and logos, icons and tracking
 * pixels are dropped. The person picks; this only orders the choice.
 */
export function extractImages(html: string, pageUrl: string, hints: string[]): ImageCandidate[] {
  const found = new Map<string, ImageCandidate>();
  const words = hints.map((h) => h.toLowerCase()).filter((h) => h.length >= 2);

  const add = (raw: string | undefined | null, alt: string | null, width: number | null, bonus: number) => {
    if (!raw || raw.startsWith("data:")) return;
    let abs: URL;
    try { abs = new URL(raw.trim(), pageUrl); } catch { return; }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") return;
    const path = decodeURIComponent(abs.pathname);
    if (/\.(svg|gif|ico)$/i.test(path) || JUNK.test(path) || (alt && JUNK.test(alt))) return;
    if (width != null && width < 250) return;
    const text = `${path} ${alt ?? ""}`.toLowerCase();
    let score = bonus;
    for (const w of words) if (text.includes(w)) score += 2;
    if (GOOD_VIEW.test(text)) score += 1;
    if ((width ?? 0) >= 800) score += 2;
    // WordPress and most shops publish "-600x600" copies of one master file:
    // keep one entry per master and remember the best version of it.
    const master = `${abs.host}${path.replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "")}`;
    const prev = found.get(master);
    const isMaster = !/-\d{2,4}x\d{2,4}\.\w+$/.test(path);
    if (!prev || score > prev.score || (isMaster && (width ?? 0) >= (prev.width ?? 0))) {
      found.set(master, { src: abs.toString(), alt: alt?.trim() || prev?.alt || null, width: width ?? prev?.width ?? null, score: Math.max(score, prev?.score ?? 0), page: pageUrl });
    }
  };

  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:secure_url" || key === "twitter:image") add(a.content, null, null, 3);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const set = a.srcset || a["data-srcset"];
    const big = set ? largestFromSrcset(set) : null;
    const src = a["data-large_image"] || a["data-zoom-image"] || a["data-full"] || big?.src || a["data-src"] || a.src;
    const width = big?.width ?? (Number(a["data-large_image_width"] || a.width) || null);
    add(src, a.alt ?? a.title ?? null, width, 1);
  }
  for (const m of html.matchAll(/<source\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const big = a.srcset ? largestFromSrcset(a.srcset) : null;
    if (big) add(big.src, null, big.width, 1);
  }
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["'][^>]*>/gi)) add(m[1], null, null, 2);
  for (const m of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
    try {
      const v = JSON.parse(m[1]) as unknown;
      for (const u of Array.isArray(v) ? v : [v]) if (typeof u === "string") add(u, null, null, 3);
    } catch { /* not JSON-LD after all */ }
  }

  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 36);
}

export function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

// ─── Claude ──────────────────────────────────────────────────────────────────

/** A Claude client, only when the configured key IS a Claude key (see pd-ai). */
export function pdClaude(): Anthropic | null {
  const ai = pdAiKey();
  return ai?.provider === "anthropic" ? new Anthropic({ apiKey: ai.key }) : null;
}

export const PD_RESEARCH_MODEL = process.env.PD_RESEARCH_MODEL || "claude-opus-5";

export const NEEDS_KEY = {
  needsKey: true,
  message: "The web search needs an AI key (ChatGPT or Claude) in Vercel as PD_ANTHROPIC_API_KEY or PD_OPENAI_API_KEY. Until then, paste a product page link or use the search links.",
};
