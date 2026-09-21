"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WaveDivider } from "./wave-divider";
import type { LandingReview } from "@/lib/landing-reviews";

/**
 * "Postcards from the crew": the review wall on the Experience home.
 *
 * Polaroids, not testimonial cards. A trip is something you bring photos back
 * from, so each review is one: taped at the top and the reviewer's own face
 * stuck on the corner. The tilt is the fun; it straightens when you reach for
 * a card.
 *
 * No place or year on the card (Nico, 18 Sep 2026): the wall sells the week,
 * not one past edition of it.
 *
 * Faces: only the reviewer's profile photo, and only with their opt-in (see
 * lib/landing-reviews). Without one, their initial in the sun gradient.
 */

const TILTS = [-2.2, 1.6, -1.1, 2.3, -1.7, 1.2, -2.6, 0.9];

/**
 * The card shows whole sentences only, as many as fit. A clamp cut Thomas J.
 * mid-thought at 'Only "problem" I would…', which reads like the wall is
 * hiding something. It is not: the full review, criticism included, is one
 * tap away under "Read it all". Showing only the praise and dropping the rest
 * would misrepresent a customer review (UWG Anhang Nr. 23c), so the words are
 * never edited, only excerpted.
 */
const CARD_CHARS = 175;
export function cardExcerpt(quote: string, max = CARD_CHARS): string {
  const q = quote.trim().replace(/\s+/g, " ");
  if (q.length <= max) return q;
  // A sentence ends at . ! ? only when a NEW one starts after it (capital
  // letter), so "special requests, etc.) was" is not taken for an end.
  const sentences = q.split(/(?<=[.!?]["')\]]*)\s+(?=[A-Z0-9"“‘(])/);
  let out = "";
  for (const sn of sentences) {
    const next = out ? `${out} ${sn}` : sn;
    if (next.length > max) break;
    out = next;
  }
  // First sentence alone is too long: fall back to a word boundary.
  if (!out.trim()) {
    const cut = q.slice(0, max);
    return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\-]$/, "") + "…";
  }
  return out.trim();
}

/**
 * The polaroid row. Bounded by the page column (the logo-to-avatar width of
 * the header, Nico drew it in red on 18 Sep 2026) and fading out the same on
 * both sides as cards reach those lines, so they glide out of view instead of
 * being cut off by a hard box. It first ran to the screen edge and faded only
 * there, which on a wide screen put the fade far right of a centred page and
 * the arrow on top of a card. The first card lines up with the heading and
 * sits just inside the fade; the arrows sit on the column edge, not on a card.
 * Wheel/trackpad and touch scroll natively; a mouse can drag; the arrows move
 * one card at a time.
 */
const BAND = "max-w-[1232px]";
const PAD = "max(1.5rem, calc((100% - 1200px) / 2 + 2rem))";
const FADE = "clamp(16px, calc((100% - 1200px) / 2 + 2rem), 48px)";
// On the column edge when the screen has room beside it, else 4px inside the screen.
const ARROW = "max(-24px, calc((100% - 100vw) / 2 + 4px))";
function Track({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [update]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    const card = el?.querySelector("article");
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + 24), behavior: "smooth" });
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current!;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    el.style.scrollSnapType = "none";
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    ref.current!.scrollLeft = d.left - dx;
  };
  const onUp = () => {
    const el = ref.current;
    if (el) el.style.scrollSnapType = "";
    // keep `moved` for the click that follows this pointerup
    setTimeout(() => { drag.current = null; }, 0);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); }
  };

  const mask = `linear-gradient(to right, transparent 0, #000 ${FADE}, #000 calc(100% - ${FADE}), transparent 100%)`;
  return (
    <div className={`relative mx-auto ${BAND}`}>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onClickCapture={onClickCapture}
        className="flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-proximity motion-safe:scroll-smooth py-10 -my-10 select-none md:cursor-grab md:active:cursor-grabbing focus-visible:outline-none"
        style={{ paddingInline: PAD, scrollPaddingInline: PAD, WebkitMaskImage: mask, maskImage: mask }}
      >
        {children}
        {/* Room after the last card: inline-end padding is not reliable on a
            scrolling flex row. */}
        <span aria-hidden className="shrink-0 w-px" />
      </div>
      {(["prev", "next"] as const).map((k) => {
        const hidden = k === "prev" ? edge.start : edge.end;
        return (
          <button key={k} type="button" aria-label={k === "prev" ? "Previous reviews" : "More reviews"}
            onClick={() => step(k === "prev" ? -1 : 1)} tabIndex={hidden ? -1 : 0}
            className={`hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white text-[#00374a] shadow-[0_8px_24px_-8px_rgba(0,20,30,.6)] items-center justify-center hover:bg-[#00374a] hover:text-white transition-all duration-300 ${hidden ? "opacity-0 pointer-events-none scale-90" : "opacity-100"}`}
            style={k === "prev" ? { left: ARROW } : { right: ARROW }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={k === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

const Stars = ({ n, className = "" }: { n: number; className?: string }) => (
  <span className={`tracking-[0.08em] ${className}`} role="img" aria-label={`Rated ${n} out of 5`}>
    {"★".repeat(n)}<span className="opacity-25">{"★".repeat(5 - n)}</span>
  </span>
);

/**
 * The reviewer's face: their own profile photo when they shared it, otherwise
 * the photo picked for their review (Nico, 18 Sep 2026: "apply their selected
 * photo as their profile photo"). That photo is already on the card, so the
 * sticker shows nothing new, zoomed towards the upper middle where the face
 * usually is. The initial is only for a review with no photo at all.
 */
function Face({ r, size, ring }: { r: LandingReview; size: string; ring: string }) {
  const src = r.avatarUrl || r.image;
  if (src) {
    return (
      <span className={`${size} ${ring} rounded-full shrink-0 block bg-no-repeat`}
        style={r.avatarUrl
          ? { backgroundImage: `url('${src}')`, backgroundSize: "cover", backgroundPosition: "center" }
          : { backgroundImage: `url('${src}')`, backgroundSize: "185%", backgroundPosition: "50% 32%" }}
        aria-hidden />
    );
  }
  return (
    <span className={`${size} ${ring} rounded-full shrink-0 flex items-center justify-center font-black text-white`}
      style={{ background: "linear-gradient(135deg,#ffc42e 0%,#f47b20 100%)" }} aria-hidden>
      {r.name.charAt(0)}
    </span>
  );
}

export function CrewReviews({ items, count, avg, eyebrow, title, sub }: {
  items: LandingReview[]; count: number; avg: number | null;
  eyebrow: string; title: string; sub: string;
}) {
  // Only a click opens the overlay, so it never renders on the server and the
  // portal needs no "mounted" guard.
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenIdx(null); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [openIdx]);

  if (!items.length) return null;
  const open = openIdx != null ? items[openIdx] : null;

  // "Straight from | the crew." → the part after | in sun yellow.
  const [t1, t2] = title.includes("|") ? title.split("|", 2).map((s) => s.trim()) : [title, ""];
  // Shared profile photos first, then review photos.
  const faces = [...items.filter((r) => r.avatarUrl), ...items.filter((r) => !r.avatarUrl && r.image)].slice(0, 5);
  const showStat = avg != null && count >= 3;

  return (
    /*
     * ITS OWN GROUND. The wall used to sit on the same ocean as the trips below
     * it, so the page read as one long blue stretch and the two sections ran
     * into each other (Nico, 21 Sep 2026). A warm paper band with a wave at
     * each end separates them, and it is the same paper the review card itself
     * is made of. The band also settles as it scrolls, so leaving it hands the
     * eye over to what comes next instead of just ending.
     */
    <section id="reviews" aria-labelledby="crew-reviews-title" className="np7-band scroll-mt-20 relative">
      <WaveDivider topColor="#fff7ec" bottomColor="transparent" />
      <div className="bg-[#fff7ec] pt-10 sm:pt-14 pb-4">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-12">
          <div className="max-w-[560px]">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#b0791e] mb-3">{eyebrow}</p>
            <h2 id="crew-reviews-title" className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4 [text-wrap:balance]">
              {t1}{t2 && <> <span className="bg-gradient-to-r from-[#ffc42e] to-[#ff9a4a] bg-clip-text text-transparent">{t2}</span></>}
            </h2>
            <p className="text-[16px] text-[#5d7079] leading-relaxed">{sub}</p>
          </div>

          {showStat && (
            /* The score as a sticker slapped on the page, faces included. */
            <div className="self-start md:self-auto -rotate-2 rounded-2xl bg-[#00374a] text-white px-5 py-4 shadow-[0_18px_40px_-20px_rgba(0,20,30,.55)] flex items-center gap-4">
              <div>
                <p className="text-[40px] leading-none font-black tracking-[-0.04em] text-white tabular-nums">{avg!.toFixed(1)}</p>
                <Stars n={Math.round(avg!)} className="text-[15px] text-[#f5a623]" />
              </div>
              <div className="border-l border-white/20 pl-4">
                {faces.length > 0 && (
                  <div className="flex -space-x-2.5 mb-1.5">
                    {faces.map((r) => <Face key={r.id} r={r} size="w-8 h-8" ring="ring-2 ring-[#00374a]" />)}
                    {count > faces.length && (
                      <span className="w-8 h-8 rounded-full ring-2 ring-[#00374a] bg-[#0b5f78] text-white text-[10.5px] font-black flex items-center justify-center">
                        +{count - faces.length}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[12.5px] font-bold text-white leading-tight">{count} guest reviews</p>
                <p className="text-[11.5px] text-white/70 leading-tight">from real NP7 weeks</p>
              </div>
            </div>
          )}
        </div>

      </div>

      <Track label="Guest reviews">
          {items.map((r, i) => {
            const excerpt = cardExcerpt(r.quote);
            const long = excerpt !== r.quote.trim().replace(/\s+/g, " ") || !!r.reply;
            return (
              <article key={r.id} className="np7-review-card snap-start shrink-0 w-[270px] sm:w-[300px] pt-4 pb-6">
                <div
                  className="relative h-full flex flex-col rounded-[6px] bg-[#fffdf8] p-3 pb-5 shadow-[0_22px_44px_-22px_rgba(0,20,30,.75)] [transform:rotate(var(--tilt))] motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:[transform:rotate(0deg)_translateY(-6px)] focus-within:[transform:rotate(0deg)]"
                  style={{ ["--tilt" as string]: `${TILTS[i % TILTS.length]}deg` }}
                >
                  {/* tape */}
                  <span aria-hidden className="absolute -top-3 left-1/2 -translate-x-1/2 -rotate-3 w-[84px] h-[22px] bg-[#ffc42e]/70 shadow-sm" />

                  <div className="relative">
                  <div className="relative aspect-[4/3] rounded-[3px] overflow-hidden bg-[#0a4f66]">
                    {r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover object-[50%_30%]" />
                    )}
                    {r.verified && (
                      <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wide text-white bg-[#00afdb]/90 px-2 py-0.5 rounded-full">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                        Verified guest
                      </span>
                    )}
                  </div>
                  {/* the reviewer, stuck on the corner */}
                  <div className="absolute -bottom-[26px] left-3 z-10">
                    <Face r={r} size="w-[52px] h-[52px] text-[18px]" ring="ring-[3px] ring-[#fffdf8] shadow-md" />
                  </div>
                  </div>

                  <div className="pt-9 px-1.5 flex-1 flex flex-col">
                    <Stars n={r.rating} className="text-[14px] text-[#f5a623]" />
                    <p className="mt-2 text-[14.5px] leading-snug font-semibold text-[#00374a] line-clamp-6">&ldquo;{excerpt}&rdquo;</p>
                    <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                      <p className="text-[12.5px] leading-tight">
                        <span className="block font-black text-[#00374a]">{r.name}</span>
                        {r.country && <span className="block text-[#6a7a80]">{r.country}</span>}
                      </p>
                      {long && (
                        <button type="button" onClick={() => setOpenIdx(i)}
                          className="shrink-0 text-[12px] font-bold text-[#0782a0] hover:text-[#00374a] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#00afdb] rounded">
                          Read it all
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
      </Track>
      </div>
      <WaveDivider topColor="#fff7ec" bottomColor="transparent" flip />

      {open && createPortal(
        <div className="fixed inset-0 z-[130] bg-[#00131b]/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => setOpenIdx(null)} role="dialog" aria-modal="true" aria-label={`Review by ${open.name}`}>
          {/* On a phone this is a SHEET, and a sheet only as tall as its text
              opens as a strip hugging the bottom with a blurred no-man's-land
              above it (Nico, 21 Sep 2026: "on mobile its akward, all super
              low"). A floor height makes it open like a sheet every time, and
              the body scrolls inside it rather than the sheet growing. On a
              desktop it stays the centred card it was. */}
          <div className="relative w-full sm:max-w-[540px] min-h-[68svh] sm:min-h-0 max-h-[92svh] sm:max-h-[86svh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#fffdf8] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {/* 170px over a phone's full width is a letterbox, not a photo. */}
              <div className="relative h-[250px] sm:h-[210px] shrink-0 bg-[#0a4f66]">
                {open.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={open.image} alt="" className="absolute inset-0 w-full h-full object-cover object-[50%_28%]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                <button type="button" onClick={() => setOpenIdx(null)} aria-label="Close"
                  className="absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#00374a] text-white text-[12.5px] font-bold pl-3 pr-3.5 py-1.5 hover:bg-[#013242] transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 6l12 12M6 18L18 6" /></svg>
                  Back
                </button>
                <div className="absolute -bottom-7 left-6">
                  <Face r={open} size="w-[60px] h-[60px] text-[20px]" ring="ring-4 ring-[#fffdf8]" />
                </div>
              </div>
              <div className="px-6 sm:px-7 pt-10 pb-12 sm:pb-7" style={{ paddingBottom: "max(3rem, calc(env(safe-area-inset-bottom) + 2rem))" }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Stars n={open.rating} className="text-[15px] text-[#f5a623]" />
                </div>
                <p className="mt-3 text-[15.5px] text-[#00374a] leading-relaxed font-medium whitespace-pre-line">&ldquo;{open.quote}&rdquo;</p>
                <p className="mt-4 text-[13px] font-semibold text-[#6a7a80]">
                  <span className="font-black text-[#00374a]">{open.name}</span>{open.country ? ` · ${open.country}` : ""}{open.verified ? " · Verified guest" : ""}
                </p>
                {open.reply && (
                  <div className="mt-6 rounded-2xl bg-[#eef7fa] border border-[#d3ecf4] p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0782a0] mb-2">Response from NP7</p>
                    <p className="text-[14px] text-[#00374a] leading-relaxed whitespace-pre-line">{open.reply}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
