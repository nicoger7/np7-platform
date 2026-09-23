"use client";

import { useEffect, useRef, useState } from "react";
import { boardSearchQuery, topPhoto, type BoardPhoto, type PdBoard } from "@/lib/board-measurements";
import { Card, Chip, Icon, InfoTip, SaveNote, btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, inputCls } from "@/components/admin/pd-ui";
import { BoardPhotoThumb } from "@/components/admin/pd-thumbs";
import type { FoundPictures } from "@/components/admin/board-plan";

type Candidate = { src: string; alt: string | null; width: number | null; score: number; page: string };

/**
 * "Search thumbnail": find a top view of this board on the web and keep it as
 * the picture the board is shown by in lists.
 *
 * Two ways in, and the second never needs a key: Find automatically (Claude's
 * web search finds the brand's product page), or paste a link: the product
 * page, the picture itself, or a Google Images link (share.google/…). Either
 * way the pictures come back as a grid, best guess first, and a person picks.
 * Nothing is kept until they do. A picture with the deck and the bottom side
 * by side is cut apart on keeping, and the deck becomes the top view.
 */
export function BoardPictureFinder({ board, onSaved, autoStart, initial }: {
  board: PdBoard; onSaved: (photos: BoardPhoto[]) => void; autoStart?: boolean;
  /** Pictures a search already found elsewhere (the 2D plan): shown, not searched again. */
  initial?: FoundPictures | null;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"" | "auto" | "link" | "save">("");
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  // What the search found besides the picture it kept by itself: "Choose another".
  const [others, setOthers] = useState<Candidate[]>([]);
  const [pages, setPages] = useState<{ url: string; title: string | null }[]>([]);
  const [images, setImages] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const current = topPhoto(board.photos);
  const query = boardSearchQuery(board);

  async function find(auto: boolean) {
    setBusy(auto ? "auto" : "link"); setMsg(""); setNote(""); setPicked(null); setOthers([]);
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/images`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auto ? {} : { url }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (j.needsKey) { setMsg(j.message); return; }
    if (!res.ok) { setMsg(j.error ?? "That didn't work."); return; }
    setPages(j.pages ?? []);
    // The search kept the picture that is clearly this board (or the pasted
    // link was a picture): done, with the rest on offer.
    if (j.kept) {
      setImages(null); setUrl("");
      setNote(j.note ?? "Kept.");
      setOthers((j.images ?? []).filter((i: Candidate) => i.src !== j.chosen?.src));
      onSaved(j.photos ?? []);
      return;
    }
    setImages(j.images ?? []);
    if (j.note) setNote(j.note);
    if (!(j.images ?? []).length) setMsg("No usable pictures on that page. Try the brand's own product page.");
  }

  // Arriving from "Find a top view" (header or 2D plan): search once, now,
  // and take ?find=1 off the address so a reload does not search again.
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    const t = setTimeout(() => {
      void find(true);
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has("find")) { u.searchParams.delete("find"); window.history.replaceState(null, "", u.pathname + u.search); }
      } catch { /* the search still runs */ }
    }, 0);
    return () => clearTimeout(t);
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handed pictures from the 2D plan: show them as they are.
  const [shown, setShown] = useState<FoundPictures | null>(null);
  if (initial && initial !== shown) {
    setShown(initial);
    setPages(initial.pages); setImages(initial.images); setPicked(null);
    setNote(initial.note ?? "None of these is clearly this board: pick the right one.");
  }

  async function keep() {
    if (!picked) return;
    setBusy("save"); setMsg(""); setNote("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/images`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: picked.src, page: picked.page }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(j.error ?? "Couldn't keep that picture."); return; }
    setImages(null); setPicked(null); setMsg("Saved");
    if (j.note) setNote(j.note);
    onSaved(j.photos ?? []);
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <Card title="Top-view picture" icon="image" tone="pink"
      subtitle="The picture this board is shown by in lists"
      info={<>Find automatically reads the pages the Research tab found (else the AI searches the web for the brand&apos;s product page) and keeps the picture that names this board&apos;s size by itself; when none is that clear, you pick from the grid. Pasting a link always works, no key needed: a product page shows its pictures, a picture or Google Images link is kept straight away. A picture showing the deck and the bottom side by side is cut apart, and the AI says which one is the deck. Kept in Product Dev with its source, for internal reference only.</>}
      actions={<SaveNote msg={msg === "Saved" ? msg : ""} />}>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-56 h-28 rounded-xl shrink-0 flex items-center justify-center"
          style={{ backgroundColor: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>
          {current ? <BoardPhotoThumb photo={current} /> : <span className="text-xs admin-faint">No picture chosen</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => find(true)} disabled={!!busy} className={btnPrimary} style={btnPrimaryStyle}>
              <Icon name="search" className="w-4 h-4" />{busy === "auto" ? "Searching…" : "Find automatically"}
            </button>
            <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${query} windsurf board`)}`}
              target="_blank" rel="noreferrer" className={btnSecondary} style={btnSecondaryStyle}>
              Open an image search<Icon name="chevron" className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={url} placeholder="…or paste a link: product page, picture or Google Images (a picture link is kept straight away)"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) find(false); }} />
            <button onClick={() => find(false)} disabled={!!busy || !url.trim()} className={btnSecondary} style={btnSecondaryStyle}>
              {busy === "link" ? "Reading…" : "Get pictures"}
            </button>
          </div>
          {msg && msg !== "Saved" && <p className="text-xs text-amber-600 leading-relaxed">{msg}</p>}
          {note && (
            <p className="text-xs leading-relaxed admin-muted flex items-start gap-1.5">
              <Icon name="check" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
              <span>
                {note}{" "}
                {others.length > 0 && !images && (
                  <button onClick={() => { setImages(others); setNote(""); }} className="font-semibold hover:underline mr-2" style={{ color: "var(--admin-accent)" }}>Choose another</button>
                )}
                <button onClick={() => setNote("")} className="admin-faint hover:text-[var(--admin-accent)] underline">OK</button>
              </span>
            </p>
          )}
        </div>
      </div>

      {images && images.length > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold admin-heading">{images.length} pictures from</span>
            {pages.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title={p.title ?? p.url}>
                <Chip tone="sky">{new URL(p.url).hostname.replace(/^www\./, "")}</Chip>
              </a>
            ))}
            <InfoTip>Best guess first: pictures whose name mentions the model or the size lead. Pick a full top view of the deck or the bottom.</InfoTip>
            <div className="ml-auto flex gap-2">
              <button onClick={() => { setImages(null); setPicked(null); }} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
              <button onClick={keep} disabled={!picked || busy === "save"} className={btnPrimary} style={btnPrimaryStyle}>
                {busy === "save" ? "Saving…" : "Use this picture"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {images.map((img) => {
              const on = picked?.src === img.src;
              return (
                <button key={img.src} onClick={() => setPicked(img)} title={img.alt ?? img.src}
                  className="aspect-square rounded-xl overflow-hidden transition-shadow"
                  style={{
                    backgroundColor: "#fff",
                    border: on ? "2px solid var(--admin-accent)" : "1px solid var(--admin-border)",
                    boxShadow: on ? "0 0 0 3px var(--admin-accent-weak)" : undefined,
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
