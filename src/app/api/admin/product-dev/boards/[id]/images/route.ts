import { NextRequest, NextResponse, after } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { NEEDS_KEY, PD_RESEARCH_MODEL, extractImages, pageTitle, pdClaude, safeFetch, type ImageCandidate } from "@/lib/pd-web";
import { openAiSearchThenRecord, pdAiKey } from "@/lib/pd-ai";
import { resizeForStorage, makeThumb } from "@/lib/image-resize";
import { r2Enabled, uploadToR2 } from "@/lib/r2";
import { boardSearchQuery, boardTitle, type BoardPhoto } from "@/lib/board-measurements";

/**
 * A board's top-view picture, taken from the web.
 *
 * POST  { url }   read that page and list the pictures on it, best guess first
 * POST  {}        find the brand's product page with Claude's web search first,
 *                 then do the same (needs the key; the pasted-link path never does)
 * PUT   { src, page }  keep one: download it into Product Dev storage and make
 *                 it the picture the board is shown by in lists
 *
 * Nico, 2026-09-23: "a thumbnail grabber with ai: search thumbnail, and then it
 * searches the matching top shot." The pictures are the brands' own product
 * shots, kept for internal reference with their source; nothing here is shown
 * outside Product Dev.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type Board = { id: string; name: string; brand: string | null; model: string | null; size?: string | null; year: number | null; photos: BoardPhoto[] | null };

const PAGES = {
  name: "report_pages",
  description: "Report the pages that show this board's product pictures. Call it once.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["pages"],
    properties: {
      pages: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["url", "kind"],
          properties: { url: { type: "string" }, kind: { type: "string", enum: ["official", "shop", "review"] } },
        },
      },
    },
  },
};

async function loadBoard(id: string): Promise<Board | null> {
  const { data } = await pdDb().from("pd_boards").select("id,name,brand,model,size,year,photos").eq("id", id).single();
  return (data as Board) ?? null;
}

/** Words a good picture's file name or alt text tends to contain. */
function hintsFor(b: Board): string[] {
  const t = boardTitle(b);
  return [t.brand, ...(t.brand ?? "").split(/[\s-]+/), ...(t.model ?? "").split(/\s+/), t.size, t.year ? String(t.year) : null]
    .filter((w): w is string => Boolean(w && w.length >= 2));
}

async function picturesFrom(url: string, hints: string[]): Promise<{ page: { url: string; title: string | null }; images: ImageCandidate[] }> {
  const res = await safeFetch(url, { maxBytes: 4_000_000, accept: "text/html,application/xhtml+xml" });
  if (!/html/i.test(res.contentType)) throw new Error("That link is not a web page.");
  const html = res.body.toString("utf8");
  return { page: { url: res.url, title: pageTitle(html) }, images: extractImages(html, res.url, hints) };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;
  const board = await loadBoard(id);
  if (!board) return NextResponse.json({ error: "That board does not exist." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const hints = hintsFor(board);

  // 1. A link was pasted: no key, no search, just read the page.
  if (body.url?.trim()) {
    try {
      const { page, images } = await picturesFrom(body.url.trim(), hints);
      return NextResponse.json({ pages: [page], images });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read that page." }, { status: 400 });
    }
  }

  // 2. Find the pages first.
  const ai = pdAiKey();
  if (!ai) return NextResponse.json(NEEDS_KEY);
  const ask = `Find the web pages with the best product pictures of this windsurf board, ideally a full top view of the deck or bottom: ${boardSearchQuery(board)}. ` +
    `The brand's own product page comes first; add at most two shop or review pages that show the same board clearly. Then call report_pages.`;
  let urls: string[] = [];
  try {
    if (ai.provider === "openai") {
      const r = await openAiSearchThenRecord<{ pages: { url: string }[] }>({
        key: ai.key, instructions: "You find product pages for windsurf boards.", input: ask, searchContext: "low",
        fn: { name: PAGES.name, description: PAGES.description, parameters: PAGES.input_schema },
      });
      urls = (r.args.pages ?? []).map((p) => p.url).slice(0, 3);
    }
    const client = ai.provider === "anthropic" ? pdClaude() : null;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
    for (let round = 0; client && round < 3 && !urls.length; round++) {
      const msg = await client.beta.messages.stream({
        model: PD_RESEARCH_MODEL,
        max_tokens: 4000,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }, PAGES],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).finalMessage();
      const call = msg.content.find((b) => b.type === "tool_use" && b.name === "report_pages");
      if (call && call.type === "tool_use") {
        urls = ((call.input as { pages?: { url: string }[] }).pages ?? []).map((p) => p.url).slice(0, 3);
        break;
      }
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "The web search failed." }, { status: 502 });
  }
  if (!urls.length) return NextResponse.json({ error: "No product page found. Paste a link instead." }, { status: 404 });

  const read = await Promise.allSettled(urls.map((u) => picturesFrom(u, hints)));
  const pages: { url: string; title: string | null }[] = [];
  const seen = new Set<string>();
  const images: ImageCandidate[] = [];
  read.forEach((r, i) => {
    if (r.status !== "fulfilled") { pages.push({ url: urls[i], title: null }); return; }
    pages.push(r.value.page);
    // The first page is the brand's own: its pictures lead.
    for (const img of r.value.images) {
      if (seen.has(img.src)) continue;
      seen.add(img.src);
      images.push({ ...img, score: img.score + (i === 0 ? 3 : 0) });
    }
  });
  images.sort((a, b) => b.score - a.score);
  return NextResponse.json({ pages, images: images.slice(0, 36) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;
  const board = await loadBoard(id);
  if (!board) return NextResponse.json({ error: "That board does not exist." }, { status: 404 });
  const { src, page } = (await request.json().catch(() => ({}))) as { src?: string; page?: string };
  if (!src) return NextResponse.json({ error: "Which picture?" }, { status: 400 });

  let file: File, meta: { width?: number; height?: number };
  try {
    const res = await safeFetch(src, { maxBytes: 15_000_000, accept: "image/avif,image/webp,image/png,image/jpeg,image/*" });
    const type = res.contentType.split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) return NextResponse.json({ error: "That link is not a photo (jpg, png or webp)." }, { status: 400 });
    let buf = res.body;
    let base = (new URL(res.url).pathname.split("/").pop() || "picture").replace(/[^\w.\-]+/g, "-").slice(-80);
    // The resizer and the thumbnailer read jpg, png and webp by their file name;
    // anything else (avif, or a CDN link with no extension) becomes a webp,
    // which also keeps the transparent background product shots come with.
    if (!/\.(jpe?g|png|webp)$/i.test(base)) {
      buf = await sharp(buf, { failOn: "none" }).webp({ quality: 88 }).toBuffer();
      base = `${base.replace(/\.\w+$/, "")}.webp`;
    }
    meta = await sharp(buf).metadata();
    file = new File([new Uint8Array(buf)], base, { type: base.endsWith(".webp") ? "image/webp" : type });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't download that picture." }, { status: 400 });
  }

  const key = `product-dev/boards/${id}/web/${Date.now().toString(36)}-${file.name}`;
  const { body, contentType } = await resizeForStorage(file);
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await file.arrayBuffer());
  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    if (r2Enabled()) {
      await uploadToR2(bytes, key, contentType);
      // The thumbnail now, not later: lists show it straight after the save.
      const t = await makeThumb(file).catch(() => null);
      if (t) await uploadToR2(t.body, `_thumb/${key}`, t.contentType);
      after(async () => {
        try { await svc.storage.from("assets").upload(key, bytes, { upsert: true, contentType }); } catch { /* ignore */ }
      });
    } else {
      const { error } = await svc.storage.from("assets").upload(key, bytes, { upsert: true, contentType });
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't store that picture." }, { status: 500 });
  }

  const host = (() => { try { return new URL(page || src).hostname.replace(/^www\./, ""); } catch { return "the web"; } })();
  const w = meta.width ?? null, h = meta.height ?? null;
  const photo: BoardPhoto = {
    key, w, h, kind: "top", source: page || src,
    caption: `Top view, from ${host}`,
    // Product shots stand the board up, nose at the top; a card lies it down nose-right.
    rotate: w && h && h > w * 1.15 ? 90 : 0,
  };
  const photos = [...(board.photos ?? []).map((p) => (p.kind === "top" ? { ...p, kind: null } : p)), photo];
  const { error } = await pdDb().from("pd_boards").update({ photos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photos });
}
