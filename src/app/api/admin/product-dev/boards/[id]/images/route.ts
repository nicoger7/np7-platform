import { NextRequest, NextResponse } from "next/server";
import { requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { NEEDS_KEY, resolveGoogleImageLink } from "@/lib/pd-web";
import { PictureError, autoPicture, hintsFor, keepPicture, loadPictureBoard, picturesFrom } from "@/lib/board-pictures";
import { topPhoto } from "@/lib/board-measurements";

/**
 * A board's top-view picture, taken from the web.
 *
 * POST  { url }   read that page and list the pictures on it, best guess first.
 *                 A picture link, or a Google image link (share.google/…, the
 *                 imgres links Google Images hands out), is that picture: kept
 *                 straight away.
 * POST  {}        find the pictures by itself (the pages Research found, else the
 *                 AI's page search) and KEEP the one that is clearly this board;
 *                 when none is clear, list them for a person (board-pictures.ts)
 * POST  { auto: "open" }  the same once per board, when a board without a
 *                 picture is opened; never the paid AI search
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

const fail = (err: unknown, fallback: string) =>
  NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status: err instanceof PictureError ? err.status : 502 });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;
  const board = await loadPictureBoard(id);
  if (!board) return NextResponse.json({ error: "That board does not exist." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { url?: string; auto?: string };

  // 1. A link was pasted: no key, no search.
  if (body.url?.trim()) {
    try {
      let link = body.url.trim();
      const google = await resolveGoogleImageLink(link).catch(() => null);
      if (google?.image) {
        // A picture link IS the choice: keep it (cut apart if it shows several boards).
        try {
          const kept = await keepPicture(board, { src: google.image, page: google.page ?? google.image });
          return NextResponse.json({ kept: true, ...kept, pages: [{ url: google.page ?? google.image, title: null }], images: [] });
        } catch (err) {
          // The picture itself would not come (a shop refusing hotlinks): the
          // page it sits on usually lists it, so offer that page's pictures.
          if (!google.page) throw err;
          const { page, images } = await picturesFrom(google.page, hintsFor(board));
          return NextResponse.json({ pages: [page], images, note: `That picture could not be downloaded (${err instanceof Error ? err.message : "no answer"}). Here is the page it is on: pick it there.` });
        }
      }
      if (google?.page) link = google.page;
      else if (/^https?:\/\/[^/]*google\./i.test(link) || /^https?:\/\/share\.google\//i.test(link)) {
        return NextResponse.json({ error: "That Google link does not lead to a picture. Open the picture in Google Images and share or copy that link, or paste the product page." }, { status: 400 });
      }
      const { page, images } = await picturesFrom(link, hintsFor(board));
      if (images.length === 1 && images[0].src === page.url) {
        const kept = await keepPicture(board, { src: images[0].src, page: images[0].page });
        return NextResponse.json({ kept: true, ...kept, pages: [page], images: [] });
      }
      return NextResponse.json({ pages: [page], images });
    } catch (err) {
      return fail(err, "Couldn't read that link.");
    }
  }

  // 2. Opening a board without a picture: once, and only from what Research found.
  if (body.auto === "open") {
    try {
      const r = await autoPicture(board, { aiSearch: false, once: true });
      return NextResponse.json({ outcome: r.outcome, photos: r.photos, note: r.note });
    } catch (err) {
      return fail(err, "Couldn't keep the picture.");
    }
  }

  // 3. "Find automatically" / "Find the picture & match": find, and keep the
  // clear one. A board that already has its picture only gets the list
  // ("Find another picture"): never a second copy of the same one.
  try {
    const keep = !topPhoto(board.photos);
    const r = await autoPicture(board, { aiSearch: true, keep });
    if (r.needsKey) return NextResponse.json(NEEDS_KEY);
    if (r.outcome === "kept") return NextResponse.json({ kept: true, photos: r.photos, note: r.note, pages: r.pages, images: r.images, chosen: r.chosen });
    if (!r.images.length) return NextResponse.json({ error: "No product page with pictures found. Paste a link instead." }, { status: 404 });
    return NextResponse.json({
      pages: r.pages, images: r.images,
      note: r.note ?? (keep ? "None of these is clearly this size or model: pick the right one." : null),
    });
  } catch (err) {
    return fail(err, "The search failed.");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;
  const board = await loadPictureBoard(id);
  if (!board) return NextResponse.json({ error: "That board does not exist." }, { status: 404 });
  const { src, page, key } = (await request.json().catch(() => ({}))) as { src?: string; page?: string; key?: string };
  const own = key ? (board.photos ?? []).find((p) => p.key === key) : null;
  if (key && !own) return NextResponse.json({ error: "That photo is not on this board." }, { status: 404 });
  if (!src && !own) return NextResponse.json({ error: "Which picture?" }, { status: 400 });
  try {
    const kept = await keepPicture(board, own ? { own } : { src: src!, page: page ?? null });
    return NextResponse.json(kept);
  } catch (err) {
    return fail(err, "Couldn't keep that picture.");
  }
}
