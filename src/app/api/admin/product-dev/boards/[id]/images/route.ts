import { NextRequest, NextResponse, after } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { NEEDS_KEY, PD_RESEARCH_MODEL, extractImages, pageTitle, pdClaude, resolveGoogleImageLink, safeFetch, type ImageCandidate } from "@/lib/pd-web";
import { openAiSearchThenRecord, pdAiKey } from "@/lib/pd-ai";
import { resizeForStorage, makeThumb } from "@/lib/image-resize";
import { r2Enabled, uploadToR2 } from "@/lib/r2";
import { boardSearchQuery, boardTitle, type BoardPhoto } from "@/lib/board-measurements";
import { cutOutBoards, identifyBoards, type BoardView } from "@/lib/board-cutout";
import { keyUrl } from "@/lib/img";

/**
 * A board's top-view picture, taken from the web.
 *
 * POST  { url }   read that page and list the pictures on it, best guess first.
 *                 A picture link, or a Google image link (share.google/…, the
 *                 imgres links Google Images hands out), gives that picture first,
 *                 then the rest of the page it came from.
 * POST  {}        find the brand's product page with Claude's web search first,
 *                 then do the same (needs the key; the pasted-link path never does)
 * PUT   { src, page }  keep one: download it into Product Dev storage and make
 *                 it the picture the board is shown by in lists
 * PUT   { key }   the same for a photo the board already has (an upload)
 *
 * A picture showing several boards (the deck and the bottom side by side, as
 * brands like to show them) is cut into one transparent picture per board, and
 * the AI says which is the deck: the deck becomes the picture the board is
 * shown by and measured from, the bottom is kept next to it, the original too.
 * Nico, 24.09.2026, with FMX's Invictus picture: "it should be able to cut out
 * the deck from here, and identify what is the deck". Runs by itself on "Use
 * this picture"; without an AI key the left board is taken as the deck and the
 * captions say it was a guess.
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
  const res = await safeFetch(url, { maxBytes: 4_000_000, accept: "text/html,application/xhtml+xml,image/*" });
  // A picture link: that picture is the one on offer.
  if (/^image\//i.test(res.contentType)) {
    return { page: { url: res.url, title: null }, images: [{ src: res.url, alt: "The picture from the link", width: null, score: 100, page: res.url }] };
  }
  if (!/html/i.test(res.contentType)) throw new Error("That link is not a web page or a picture.");
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
      let link = body.url.trim();
      const google = await resolveGoogleImageLink(link).catch(() => null);
      if (google?.image) {
        // The picture Google showed first, then the rest of its page.
        const first: ImageCandidate = { src: google.image, alt: "The picture from the link", width: null, score: 100, page: google.page ?? google.image };
        const rest = google.page ? await picturesFrom(google.page, hints).catch(() => null) : null;
        const images = [first, ...(rest?.images ?? []).filter((i) => i.src !== first.src)];
        return NextResponse.json({ pages: [rest?.page ?? { url: google.page ?? google.image, title: null }], images });
      }
      if (google?.page) link = google.page;
      else if (/^https?:\/\/[^/]*google\./i.test(link) || /^https?:\/\/share\.google\//i.test(link)) {
        return NextResponse.json({ error: "That Google link does not lead to a picture. Open the picture in Google Images and share or copy that link, or paste the product page." }, { status: 400 });
      }
      const { page, images } = await picturesFrom(link, hints);
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
  const { src, page, key: ownKey } = (await request.json().catch(() => ({}))) as { src?: string; page?: string; key?: string };
  const own = ownKey ? (board.photos ?? []).find((p) => p.key === ownKey) : null;
  if (ownKey && !own) return NextResponse.json({ error: "That photo is not on this board." }, { status: 404 });
  if (!src && !own) return NextResponse.json({ error: "Which picture?" }, { status: 400 });

  let file: File, buf: Buffer;
  try {
    const res = await safeFetch(own ? keyUrl(own.key) : src!, { maxBytes: 15_000_000, accept: "image/avif,image/webp,image/png,image/jpeg,image/*" });
    const type = res.contentType.split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) return NextResponse.json({ error: "That link is not a photo (jpg, png or webp)." }, { status: 400 });
    buf = res.body;
    let base = (new URL(res.url).pathname.split("/").pop() || "picture").replace(/[^\w.\-]+/g, "-").slice(-80);
    // The resizer and the thumbnailer read jpg, png and webp by their file name;
    // anything else (avif, or a CDN link with no extension) becomes a webp,
    // which also keeps the transparent background product shots come with.
    if (!/\.(jpe?g|png|webp)$/i.test(base)) {
      buf = await sharp(buf, { failOn: "none" }).webp({ quality: 88 }).toBuffer();
      base = `${base.replace(/\.\w+$/, "")}.webp`;
    }
    file = new File([new Uint8Array(buf)], base, { type: base.endsWith(".webp") ? "image/webp" : type });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't download that picture." }, { status: 400 });
  }

  const source = own ? own.source ?? null : page || src || null;
  const host = (() => { try { return new URL(source ?? "").hostname.replace(/^www\./, ""); } catch { return own ? "an upload" : "the web"; } })();
  const stamp = Date.now().toString(36);
  const stem = file.name.replace(/\.\w+$/, "");
  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tall = (w: number | null, h: number | null) => (w && h && h > w * 1.15 ? 90 : 0);

  // Several boards in one picture: one cut-out each, and which is the deck.
  let cut: Awaited<ReturnType<typeof cutOutBoards>> | null = null;
  try { cut = await cutOutBoards(buf); } catch { cut = null; }
  const several = (cut?.boards.length ?? 0) >= 2 ? cut! : null;
  let note = "";
  const added: BoardPhoto[] = [];
  try {
    if (several) {
      const faces = await identifyBoards(buf, several.boards.length, several.layout, boardSearchQuery(board));
      let keep = several.boards.map((b, i) => ({ b, v: faces.views[i] as BoardView }));
      if (keep.some((k) => k.v.this_board !== "no")) keep = keep.filter((k) => k.v.this_board !== "no");
      const topAt = Math.max(0, keep.findIndex((k) => k.v.view === "deck"));
      const guessed = faces.by === "guess";
      const where = (i: number) => (several.layout === "standing" ? ["left", "right", "third", "fourth"] : ["top", "bottom", "third", "fourth"])[i] ?? `no. ${i + 1}`;

      // The original stays too, as a plain photo, unless it is already one.
      let originalKey = own?.key ?? null;
      if (!own) {
        originalKey = `product-dev/boards/${id}/web/${stamp}-${file.name}`;
        const m = await storePicture(svc, file, originalKey);
        added.push({ key: originalKey, w: m.w, h: m.h, kind: null, source, caption: `Product picture (${several.boards.length} boards), from ${host}`, rotate: tall(m.w, m.h) });
      }
      for (let i = 0; i < keep.length; i++) {
        const { b, v } = keep[i];
        const face = v.view === "unclear" ? null : v.view;
        const name = `${stem}-${face ?? `board${b.index + 1}`}.webp`;
        const k = `product-dev/boards/${id}/web/${stamp}-${name}`;
        const m = await storePicture(svc, new File([new Uint8Array(b.webp)], name, { type: "image/webp" }), k);
        const label = face === "deck" ? "Deck" : face === "bottom" ? "Bottom" : `Board ${b.index + 1}`;
        added.push({
          key: k, w: m.w ?? b.w, h: m.h ?? b.h, kind: i === topAt ? "top" : null, source,
          view: face, viewBy: guessed ? "guess" : "ai", cutFrom: originalKey,
          caption: `${label}, cut out of the product picture from ${host}${guessed ? ` (a guess: the ${where(b.index)} one)` : ""}`,
          rotate: tall(m.w ?? b.w, m.h ?? b.h),
        });
      }
      const deck = keep.find((k) => k.v.view === "deck"), bottom = keep.find((k) => k.v.view === "bottom");
      note = guessed
        ? `${several.boards.length} boards in the picture, cut apart. ${faces.why === "no-key" ? "No AI key is set" : "The AI did not answer"}, so the ${where(keep[topAt].b.index)} one is taken as the deck: check it on the Photos tab (click Deck/Bottom to change).`
        : `${several.boards.length} boards in the picture, cut apart. The AI says the ${deck ? `${where(deck.b.index)} one is the deck (${deck.v.why})` : "deck is not clear, so the first one is used"}${bottom ? `, the ${where(bottom.b.index)} one the bottom` : ""}. The deck is shown in lists and under the 2D plan.`;
    } else if (!own) {
      const k = `product-dev/boards/${id}/web/${stamp}-${file.name}`;
      const m = await storePicture(svc, file, k);
      // Product shots stand the board up, nose at the top; a card lies it down nose-right.
      added.push({ key: k, w: m.w, h: m.h, kind: "top", source, caption: `Top view, from ${host}`, rotate: tall(m.w, m.h) });
    } else {
      return NextResponse.json({ error: cut?.reason ?? "Only one board in that picture: nothing to cut apart." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't store that picture." }, { status: 500 });
  }

  // One top picture per board: a new one takes over.
  const hasTop = added.some((p) => p.kind === "top");
  const photos = [...(board.photos ?? []).map((p) => (hasTop && p.kind === "top" ? { ...p, kind: null } : p)), ...added];
  const { error } = await pdDb().from("pd_boards").update({ photos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photos, note });
}

/** Resize, store (R2 with its thumbnail, or Supabase), and say the size kept. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storePicture(svc: SupabaseClient<any, any, any>, file: File, key: string): Promise<{ w: number | null; h: number | null }> {
  const { body, contentType } = await resizeForStorage(file);
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await file.arrayBuffer());
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
  const meta = await sharp(bytes).metadata().catch(() => null);
  return { w: meta?.width ?? null, h: meta?.height ?? null };
}
