import "server-only";
import { after } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { pdDb } from "@/lib/product-dev-api";
import { PD_RESEARCH_MODEL, extractImages, pageTitle, pdClaude, safeFetch, type ImageCandidate } from "@/lib/pd-web";
import { openAiSearchThenRecord, pdAiKey } from "@/lib/pd-ai";
import { resizeForStorage, makeThumb } from "@/lib/image-resize";
import { r2Enabled, uploadToR2 } from "@/lib/r2";
import { boardSearchQuery, boardTitle, topPhoto, type BoardPhoto, type BoardResearch } from "@/lib/board-measurements";
import { cutOutBoards, identifyBoards, type BoardView } from "@/lib/board-cutout";
import { keyUrl } from "@/lib/img";

/**
 * A board's top-view picture: find it on the web, pick it, keep it.
 *
 * One path for everything that looks for a picture: the picture finder's
 * buttons, the 2D plan's "Find the picture & match", a finished Research run,
 * and opening a board that has none. Nico, 24.09.2026: "cant the system search
 * itself?" It could: the FMX board's Research had already found FMX's product
 * page, and that page's own picture of the 138 ranks first. Nothing followed
 * up, and a person still had to pick.
 *
 * So: the pages Research found are read first (no AI search, no cost); the AI
 * page search only runs when there are none. A picture that names this board's
 * size (or, with no size, its model) is kept by itself, cut apart if it shows
 * the deck and the bottom, with the deck picked out. When nothing is that
 * clear, the pictures go back to a person as a grid.
 */

export type PictureBoard = {
  id: string; name: string; brand: string | null; model: string | null; size?: string | null; year: number | null;
  photos: BoardPhoto[] | null; research: BoardResearch | null;
};

export class PictureError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function loadPictureBoard(id: string): Promise<PictureBoard | null> {
  const { data } = await pdDb().from("pd_boards").select("id,name,brand,model,size,year,photos,research").eq("id", id).single();
  return (data as PictureBoard) ?? null;
}

/** Words a good picture's file name or alt text tends to contain. */
export function hintsFor(b: PictureBoard): string[] {
  const t = boardTitle(b);
  return [t.brand, ...(t.brand ?? "").split(/[\s-]+/), ...(t.model ?? "").split(/\s+/), t.size, t.year ? String(t.year) : null]
    .filter((w): w is string => Boolean(w && w.length >= 2));
}

export async function picturesFrom(url: string, hints: string[]): Promise<{ page: { url: string; title: string | null }; images: ImageCandidate[] }> {
  const res = await safeFetch(url, { maxBytes: 4_000_000, accept: "text/html,application/xhtml+xml,image/*" });
  // A picture link: that picture is the one on offer.
  if (/^image\//i.test(res.contentType)) {
    return { page: { url: res.url, title: null }, images: [{ src: res.url, alt: "The picture from the link", width: null, score: 100, page: res.url }] };
  }
  if (!/html/i.test(res.contentType)) throw new Error("That link is not a web page or a picture.");
  const html = res.body.toString("utf8");
  return { page: { url: res.url, title: pageTitle(html) }, images: extractImages(html, res.url, hints) };
}

/** The pages a Research run found that show the board: the brand's own first. */
export function researchPages(r: BoardResearch | null | undefined): string[] {
  const order = { official: 0, shop: 1, review: 2 } as Record<string, number>;
  const seen = new Set<string>();
  return (r?.links ?? [])
    .filter((l) => l.kind in order && /^https?:\/\//i.test(l.url))
    // A brand's home page shows every board it makes: only pages deeper than that.
    .filter((l) => { try { return new URL(l.url).pathname.replace(/\/+$/, "").length > 1; } catch { return false; } })
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((l) => l.url)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .slice(0, 3);
}

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

/** The AI's web search for the brand's product page (and at most two more). */
export async function searchProductPages(board: PictureBoard): Promise<string[]> {
  const ai = pdAiKey();
  if (!ai) throw new PictureError("needs-key", 400);
  const ask = `Find the web pages with the best product pictures of this windsurf board, ideally a full top view of the deck or bottom: ${boardSearchQuery(board)}. ` +
    `The brand's own product page comes first; add at most two shop or review pages that show the same board clearly. Then call report_pages.`;
  if (ai.provider === "openai") {
    const r = await openAiSearchThenRecord<{ pages: { url: string }[] }>({
      key: ai.key, instructions: "You find product pages for windsurf boards.", input: ask, searchContext: "low",
      fn: { name: PAGES.name, description: PAGES.description, parameters: PAGES.input_schema },
    });
    return (r.args.pages ?? []).map((p) => p.url).slice(0, 3);
  }
  const client = pdClaude();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
  for (let round = 0; client && round < 3; round++) {
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
    if (call && call.type === "tool_use") return ((call.input as { pages?: { url: string }[] }).pages ?? []).map((p) => p.url).slice(0, 3);
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  return [];
}

/** Every picture on a few pages, the first page's first. */
async function picturesFromPages(urls: string[], hints: string[]) {
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
  return { pages, images: images.slice(0, 36) };
}

/**
 * The pictures there are for this board: from the pages Research found, else
 * (when allowed) from the AI's page search.
 */
export async function findPictures(board: PictureBoard, opts: { aiSearch: boolean }): Promise<{
  pages: { url: string; title: string | null }[]; images: ImageCandidate[]; via: "research" | "search" | "none"; needsKey?: boolean;
}> {
  const hints = hintsFor(board);
  const known = researchPages(board.research);
  if (known.length) {
    const r = await picturesFromPages(known, hints);
    if (r.images.length) return { ...r, via: "research" };
  }
  if (!opts.aiSearch) return { pages: [], images: [], via: "none" };
  if (!pdAiKey()) return { pages: [], images: [], via: "none", needsKey: true };
  const urls = await searchProductPages(board);
  if (!urls.length) return { pages: [], images: [], via: "none" };
  return { ...(await picturesFromPages(urls, hints)), via: "search" };
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);
// Pictures that are about the board but not a view of its whole outline.
const NOT_A_PLAN = new Set(["side", "detail", "details", "close", "closeup", "rail", "rails", "profile", "action", "lifestyle",
  "riding", "rider", "team", "logo", "tail", "nose", "pad", "strap", "straps", "box", "bag", "cover", "video", "size", "sizes", "chart"]);

/** A picture's own words: its file name (not the query string) and its alt text. */
function nameWords(img: ImageCandidate): Set<string> {
  let file = "";
  try { file = decodeURIComponent(new URL(img.src).pathname.split("/").pop() ?? ""); } catch { /* keep empty */ }
  return new Set([...words(file.replace(/\.(jpe?g|png|webp|avif|gif)$/i, "")), ...words(img.alt ?? "")]);
}

/** The years a picture names: in its file name, alt text or its page's address
 *  ("2026", or a brand's short form like "JP25"). */
function yearsOf(img: ImageCandidate): Set<number> {
  const out = new Set<number>();
  let path = "";
  try { path = decodeURIComponent(new URL(img.page).pathname); } catch { /* none */ }
  for (const w of [...nameWords(img), ...words(path)]) {
    for (const m of w.matchAll(/(?:^|\D)(20[0-4]\d)(?!\d)/g)) out.add(Number(m[1]));
    const short = w.match(/^[a-z]{1,4}(\d{2})$/);
    if (short && Number(short[1]) >= 10 && Number(short[1]) <= 40) out.add(2000 + Number(short[1]));
  }
  return out;
}

/**
 * The picture that is clearly this board, or null. Clear = its name carries the
 * board's size ("…invictus-pro-138-2026.jpg" for the 138, not the 78 or 88
 * next to it), or with no size, all the model's words, in one picture only.
 * A picture that names another year is never it: JP's 2025 HydroFoil 85 deck
 * shot is not the 2026 85, which is a new shape.
 */
export function clearWinner(board: Pick<PictureBoard, "size" | "model"> & { year?: number | null }, images: ImageCandidate[]): ImageCandidate | null {
  const cands = images.slice(0, 40).map((img) => ({ img, w: nameWords(img) }))
    .filter((c) => ![...c.w].some((x) => NOT_A_PLAN.has(x)))
    .filter((c) => { if (!board.year) return true; const ys = yearsOf(c.img); return !ys.size || ys.has(board.year); });
  const size = (board.size ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".");
  if (size) {
    const hits = cands.filter((c) => c.w.has(size));
    if (!hits.length) return null;
    hits.sort((a, b) => b.img.score - a.img.score);
    return hits[0].img;
  }
  const model = words(board.model ?? "").filter((w) => w.length >= 2);
  if (!model.length) return null;
  const hits = cands.filter((c) => model.every((w) => c.w.has(w)));
  return hits.length === 1 ? hits[0].img : null;
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

/**
 * Keep a picture on the board: from the web ({ src, page }) or one it already
 * has ({ own }, "Cut apart"). A picture of several boards is cut apart and the
 * deck becomes the top view; the original is kept as a plain photo.
 */
export async function keepPicture(board: PictureBoard, input: { src: string; page?: string | null } | { own: BoardPhoto }): Promise<{ photos: BoardPhoto[]; note: string }> {
  const own = "own" in input ? input.own : null;
  let file: File, buf: Buffer;
  try {
    const res = await safeFetch(own ? keyUrl(own.key) : (input as { src: string }).src, { maxBytes: 15_000_000, accept: "image/avif,image/webp,image/png,image/jpeg,image/*" });
    const type = res.contentType.split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) throw new PictureError("That link is not a photo (jpg, png or webp).");
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
    if (err instanceof PictureError) throw err;
    throw new PictureError(err instanceof Error ? err.message : "Couldn't download that picture.");
  }

  const id = board.id;
  const source = own ? own.source ?? null : (input as { page?: string | null }).page || (input as { src: string }).src || null;
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
      note = `Kept as the top view, from ${host}.`;
    } else {
      throw new PictureError(cut?.reason ?? "Only one board in that picture: nothing to cut apart.");
    }
  } catch (err) {
    if (err instanceof PictureError) throw err;
    throw new PictureError(err instanceof Error ? err.message : "Couldn't store that picture.", 500);
  }

  // Re-read the list right before writing: another save may have landed while
  // this one was downloading. One top picture per board: a new one takes over.
  const fresh = (await loadPictureBoard(id))?.photos ?? board.photos ?? [];
  const hasTop = added.some((p) => p.kind === "top");
  const photos = [...fresh.map((p) => (hasTop && p.kind === "top" ? { ...p, kind: null } : p)), ...added];
  const { error } = await pdDb().from("pd_boards").update({ photos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new PictureError(error.message, 500);
  return { photos, note };
}

export type AutoPicture = {
  /** kept · unclear (pictures, none clearly this board) · none (no pictures) ·
   *  has (the board has a top view) · tried (opening the board: tried before). */
  outcome: "kept" | "unclear" | "none" | "has" | "tried";
  photos?: BoardPhoto[]; note?: string;
  pages: { url: string; title: string | null }[]; images: ImageCandidate[];
  chosen?: ImageCandidate; needsKey?: boolean;
};

/** Note the try on the board's research, so opening the board does not search again. */
async function recordTry(id: string, picture: NonNullable<BoardResearch["picture"]>) {
  const cur = await loadPictureBoard(id);
  if (!cur?.research) return;
  await pdDb().from("pd_boards").update({ research: { ...cur.research, picture } }).eq("id", id);
}

/**
 * Find this board's picture and keep it when it is clearly the one.
 *
 * `once`: only if this board was never tried (opening a board). The try is
 * claimed first, so two open tabs do not both keep a picture.
 */
export async function autoPicture(board: PictureBoard, opts: { aiSearch: boolean; once?: boolean }): Promise<AutoPicture> {
  const empty = { pages: [], images: [] };
  if (opts.once) {
    if (topPhoto(board.photos)) return { outcome: "has", ...empty };
    if (!board.research) return { outcome: "none", ...empty };
    if (board.research.picture) return { outcome: "tried", ...empty };
    const { data } = await pdDb().from("pd_boards")
      .update({ research: { ...board.research, picture: { tried_at: new Date().toISOString(), outcome: "searching" } } })
      .eq("id", board.id).is("research->picture", null).select("id");
    if (!data?.length) return { outcome: "tried", ...empty };
  }
  const found = await findPictures(board, { aiSearch: opts.aiSearch });
  if (found.needsKey) return { outcome: "none", ...empty, needsKey: true };
  const chosen = clearWinner(board, found.images);
  const at = new Date().toISOString();
  if (!chosen) {
    await recordTry(board.id, { tried_at: at, outcome: found.images.length ? "unclear" : "none", src: null });
    return { outcome: found.images.length ? "unclear" : "none", pages: found.pages, images: found.images };
  }
  try {
    const kept = await keepPicture(board, { src: chosen.src, page: chosen.page });
    await recordTry(board.id, { tried_at: at, outcome: "kept", src: chosen.src });
    return { outcome: "kept", ...kept, pages: found.pages, images: found.images, chosen };
  } catch (err) {
    await recordTry(board.id, { tried_at: at, outcome: "failed", src: chosen.src, note: err instanceof Error ? err.message : null });
    throw err;
  }
}
