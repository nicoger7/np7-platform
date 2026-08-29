"use client";

import { useEffect, useRef, useState } from "react";
import { useSelectedEdition } from "./selected-edition";
import { programForEdition, type ProgramDay } from "@/lib/program-days";

export type { ProgramDay };

/**
 * The day-by-day.
 *
 * Three decisions, all of which were learned the hard way:
 *
 * NO PHOTOS. Nico ruled on this on 2026-07-08 — "cycled gallery shots never
 * matched the day text and looked unprofessional" — and the clinic build broke
 * the rule and proved him right twice over: one hero per run cycled by modulo
 * put the SAME photograph beside all seven days, hard-cropped into a 240px edge
 * strip that phones never even saw. A sequence does not need imagery to read as
 * a story; it needs an arc, a position, and rhythm. Those are typographic.
 *
 * NOTHING IS COLLAPSED. Each day is one to three sentences. Hiding that behind
 * a "+" costs seven taps to read seven short paragraphs, and the thing being
 * hidden is exactly what someone deciding on a trip came to read. The accordion
 * was solving a length problem this content does not have.
 *
 * THE ARC IS SHOWN FIRST. You cannot perceive the shape of a week you can only
 * read one row at a time. Naming every day in a single glance — Arrival →
 * Stance → Focus → Transitions → Range → Together → Last session — turns seven
 * independent entries into a progression with a beginning and an end.
 *
 * This is close to what the premium expedition operators have converged on.
 * Intrepid, Natural Habitat, Aracari and Original Travel all ship a day-by-day
 * with ZERO per-day photography; the ones that collapse anything only do so
 * where a day runs to 150+ words, and they still leave the day's identity
 * visible. NP7 days are 30-50 words — Aracari length — which is squarely in the
 * "collapse nothing" band.
 */

/** "Day 1" is a position in a list. "Sat 10 Oct" is a plan you can hold against
 *  your own calendar and book flights around. */
function dayStamp(start: string | null | undefined, offset: number, end?: string | null): string | null {
  if (!start) return null;
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + offset);
  // A day past the end of the run gets no date. This happens whenever a short
  // run inherits a longer series program, and a wrong date is far worse than
  // no date — somebody books a flight on it.
  if (end) {
    const last = new Date(`${end}T00:00:00Z`);
    if (!Number.isNaN(last.getTime()) && d.getTime() > last.getTime()) return null;
  }
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The index label for a day.
 *
 * The arc is a glance, not a read: at full length seven titles cannot fit on
 * one line at ANY realistic width, so the row always broke six-and-one and the
 * last day sat orphaned on its own line. Shortening is what makes the chain
 * fit, and the shortening is derived rather than authored — nobody should have
 * to write a title twice.
 *
 * The title is kept whole while it is short enough to be read at a glance.
 * Past that it is cut at its natural seam — "Arrival & first sail" is about
 * arrival, "Last session & where next" is about the last session — and only if
 * there is still no seam does it fall back to trimming on a word boundary. The
 * full title is always a few centimetres below in the row itself, so the index
 * never has to carry the whole meaning.
 */
const SHORT_AT = 18;
export function shortDayLabel(title: string): string {
  const t = title.trim();
  if (t.length <= SHORT_AT) return t;
  const head = t.split(/\s*[&+·—–,]\s+/)[0]?.trim();
  if (head && head.length && head.length <= SHORT_AT) return head;
  const source = head && head.length < t.length ? head : t;
  const words = source.split(/\s+/);
  let out = "";
  for (const w of words) {
    if (out && (out + " " + w).length > SHORT_AT) break;
    out = out ? `${out} ${w}` : w;
  }
  return (out || source.slice(0, SHORT_AT)).replace(/[\s&+·,—–-]+$/, "");
}

/** "10 – 16 Oct 2026" — the run's own dates, written once across the masthead
 *  rather than repeated on every row. */
function spanLabel(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  const s = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(s.getTime())) return null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (!end || end === start) return `${d(s)} ${s.getUTCFullYear()}`;
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(e.getTime())) return `${d(s)} ${s.getUTCFullYear()}`;
  return `${d(s)} – ${d(e)} ${e.getUTCFullYear()}`;
}

/**
 * A slow drift on the masthead as the section passes.
 *
 * Deliberately small — 
 * the photograph is a backdrop for a schedule, not the subject. Honours
 * prefers-reduced-motion by never starting, and the end state is correct if it
 * never runs at all: the image is already in position, the transform only
 * nudges it.
 */
function useParallax(enabled: boolean) {
  const wrap = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const w = wrap.current, i = img.current;
    if (!w || !i) return;
    let raf = 0, running = true, visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: "120px" });
    io.observe(w);
    const tick = () => {
      if (!running) return;
      if (visible) {
        const r = w.getBoundingClientRect();
        // -1 above the viewport, +1 below it
        const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - window.innerHeight / 2) / (window.innerHeight / 2 + r.height / 2)));
        i.style.transform = `translate3d(0, ${(p * 5).toFixed(2)}%, 0) scale(1.12)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, [enabled]);
  return { wrap, img };
}

function Arrow() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0 text-[#f47b20]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ProgramForWeek({
  programByEdition, fallback, weekLabels, editionId, unit = "week",
  eyebrow, title, note, startDates, endDates,
  imageByEdition, placeByEdition, fallbackImage, fallbackPlace,
}: {
  programByEdition: Record<string, ProgramDay[]>;
  fallback: ProgramDay[];
  weekLabels: Record<string, string>;
  /**
   * Pin this to one edition instead of following the page-wide selection.
   *
   * A clinic panel is server-rendered per run, so the run it describes is known
   * at render time. Reading the shared id there would reintroduce a way for the
   * panel and its program to describe different clinics.
   */
  editionId?: string | null;
  /** A clinic runs clinics, not weeks. */
  unit?: "week" | "clinic";
  /**
   * Heading, title and caveat — all rendered INSIDE the empty check.
   *
   * The caller cannot own these: whether there are any days depends on the
   * edition selected in the browser, so a server-rendered title would sit over
   * an empty box the moment someone picked a run with no program. The caveat
   * especially has to travel with the days it qualifies.
   */
  eyebrow?: string;
  title?: string;
  note?: string;
  /** Edition id → its first day, so each row can carry a real date. */
  startDates?: Record<string, string | null>;
  /**
   * Edition id → its LAST day. Not decoration: a run inherits the series
   * program when it has none of its own, so a three-day clinic inherits a
   * seven-day week and would print confident, wrong dates for days four to
   * seven. Past the run's end we stop stamping dates rather than invent them.
   */
  endDates?: Record<string, string | null>;
  /**
   * ONE photograph for the whole run — never one per day.
   *
   * Per-day imagery was tried twice and failed twice: cycled gallery shots
   * never matched the day text (2026-07-08), and a single run hero repeated by
   * modulo put the same picture beside all seven days. The honest form is a
   * masthead: one image, bound to the run, captioned with that run's place and
   * dates, so it cannot be a Hatteras shot above a Columbia Gorge day.
   */
  imageByEdition?: Record<string, string | null>;
  placeByEdition?: Record<string, string | null>;
  /** For a trip, every week is the same place, so one shared photo is honest.
   *  A travelling clinic series passes nothing here on purpose. */
  fallbackImage?: string | null;
  fallbackPlace?: string | null;
}) {
  const { id: ctxId } = useSelectedEdition();
  const id = editionId ?? ctxId;
  const custom = id ? programByEdition[id] : undefined;
  const days = programForEdition(programByEdition, fallback, id);
  const label = id ? weekLabels[id] : undefined;
  const multiWeek = Object.keys(weekLabels).length > 1;
  const start = id ? startDates?.[id] : null;
  const end = id ? endDates?.[id] : null;
  const image = (id ? imageByEdition?.[id] : null) ?? fallbackImage ?? null;
  const place = (id ? placeByEdition?.[id] : null) ?? fallbackPlace ?? null;
  const span = spanLabel(start, end);
  const { wrap: mastRef, img: mastImgRef } = useParallax(!!image);
  /*
   * ONE fold, not one per row.
   *
   * Seven open days is a long scroll on a page that already has a hero, the
   * method, a selector, a ticket and the crew above it. But the fix is not the
   * accordion we just removed: a per-row toggle charges the deep reader seven
   * taps and gives the scanner nothing, which is precisely how this section
   * ended up hiding what people came to read.
   *
   * So the first few days stand open — enough to show the shape and the tone of
   * the writing — and ONE control opens the rest. The scanner already has the
   * whole week in the arc above; the reader is one tap from all of it.
   */
  const FOLD_AT = 4;
  const [openAll, setOpenAll] = useState(false);

  // Nothing to show is nothing to render. Trips always have the built-in
  // itinerary behind them, so this only ever fires for a clinic whose run and
  // series both have an empty program — where an empty list under a live
  // heading would read as a page that failed to load.
  if (days.length === 0) return null;

  // Folding two rows saves nothing and costs a click, so it only kicks in when
  // there is genuinely a scroll to spare.
  const foldable = days.length > FOLD_AT + 1;
  const folded = foldable && !openAll;
  const shown = folded ? days.slice(0, FOLD_AT) : days;

  return (
    <>
      {eyebrow && <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">{eyebrow}</p>}
      {title && <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-3">{title}</h2>}
      {note && <p className="text-[14.5px] text-[#5a6b72] leading-relaxed italic mb-8 max-w-[62ch]">{note}</p>}
      {multiWeek && label && (
        <p className="text-[13.5px] text-[#5a6b72] -mt-4 mb-6">
          The plan for <span className="font-bold text-[#00374a]">{label}</span>
          {custom?.length ? <span className="text-[#5a6b72]"> · this {unit} runs its own schedule</span> : null}
        </p>
      )}

      {/* THE MASTHEAD — one photograph for the run, captioned with the run's own
          place and dates. This is the honest form of imagery here: bound to the
          run rather than to a day, so it can never sit above a day it does not
          belong to, and there is exactly one of it so nothing repeats. On a
          phone it is the FIRST thing in the section, not hidden behind a
          breakpoint the way the old strip was. */}
      {image && (
        <figure ref={mastRef} className="relative mb-9 overflow-hidden rounded-3xl bg-[#00374a] shadow-[0_18px_44px_rgba(0,55,74,0.14)]">
          <div className="aspect-[3/2] sm:aspect-[21/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={mastImgRef}
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover will-change-transform"
              style={{ transform: "scale(1.12)" }}
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#00374a]/85 via-[#00374a]/25 to-transparent" aria-hidden />
          {(place || span) && (
            <figcaption className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              {place && (
                <p className="text-[15px] sm:text-[19px] font-black tracking-[-0.02em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
                  {place}
                </p>
              )}
              {span && (
                <p className="text-[12px] sm:text-[13px] font-bold tracking-[0.18em] uppercase text-white/80 mt-1">
                  {span}
                </p>
              )}
            </figcaption>
          )}
        </figure>
      )}

      {/* THE ARC — the whole shape in one glance, before a word is read.
          Below three days there is no arc to see, only a duplicate of the list. */}
      {days.length > 2 && (
        /* On a phone this wraps to seven stacked lines and costs 180px before a
           word of the plan is read, so it becomes a single edge-to-edge rail
           instead. A horizontal rail is the wrong shape for CONTENT — that is
           why the days below are a list — but it is the right shape for an
           index, where the row is a glance rather than something to read. */
        <ol className="flex items-center gap-x-2.5 gap-y-2 mb-9 pb-8 border-b border-[#e6eef0]
                       flex-nowrap overflow-x-auto snap-x scroll-px-6 -mx-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                       sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {/* The arrow leads the chip it points AT, rather than trailing the one
              before it. Grouped the other way, a wrap stranded a lone arrow at
              the end of a line and dropped the last chip onto its own row with
              nothing pointing to it. Now a wrap breaks before the arrow, so the
              chain stays readable however the line falls. */}
          {days.map((d, i) => (
            <li key={i} className="flex items-center gap-2.5 snap-start">
              {i > 0 && <Arrow />}
              <span className="text-[12.5px] font-bold text-[#00374a] bg-[#00afdb]/[0.08] px-3 py-1.5 rounded-full whitespace-nowrap">
                {shortDayLabel(d.title?.trim() || `Day ${i + 1}`)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* THE LEDGER — every day open, each one stamped so the eye has somewhere
          to land, and the real date doing the work a bullet cannot. */}
      {/* Two columns once there is room. A day row uses about 60% of a wide
          measure, so a single column spends the other 40% on nothing and makes
          the section twice as long as it needs to be. The order stays
          unambiguous because every row is numbered and dated — grid flows
          across then down, which is the order the numbers already imply. */}
      <ol
        className={`lg:grid lg:grid-cols-2 lg:gap-x-12 ${folded ? "[mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)]" : ""}`}
      >
        {shown.map((d, i) => {
          const when = dayStamp(start, i, end);
          return (
            <li
              key={i}
              className="py-6 sm:py-7 border-t border-[#e6eef0] first:border-t-0 first:pt-0 lg:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(2)]:pt-0"
            >
              {/* THE DAY STAMP. A photograph's real job in a day list is to give
                  the eye a landing point and mark where one day ends and the
                  next begins. A solid block does that with type alone — it is
                  what the operators who ship NO per-day imagery all reach for —
                  and unlike the photo it is there on a phone. */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="inline-flex items-center text-[11px] font-black tracking-[0.16em] uppercase text-white bg-[#00374a] rounded-md px-2.5 py-1.5 tabular-nums">
                  Day {i + 1}
                </span>
                {when && (
                  /* Warm against the teal stamp beside it — NP7 runs sun-to-sea,
                     not all-cyan, and a second cyan chip made the pair read as
                     one flat block. #9a4d0c rather than the brand #f47b20
                     because orange on white is ~2.9:1 and this is 11px text. */
                  <span className="inline-flex items-center text-[11px] font-bold tracking-[0.14em] uppercase text-[#9a4d0c] bg-[#f47b20]/[0.13] rounded-md px-2.5 py-1.5">
                    {when}
                  </span>
                )}
              </div>
              <h3 className="text-[20px] sm:text-[25px] font-black tracking-[-0.025em] text-[#00374a] mb-2 text-balance">
                {d.title?.trim() || `Day ${i + 1}`}
              </h3>
              {d.description?.trim() && (
                <p className="text-[15px] sm:text-[15.5px] text-[#5a6b72] leading-relaxed whitespace-pre-line max-w-[68ch]">
                  {d.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {/* One control, and it goes both ways. A fold that only opens is a trap:
          you cannot put back what you unfolded, so a long section stays long
          for the rest of the visit. */}
      {foldable && (
        <button
          type="button"
          aria-expanded={openAll}
          onClick={() => setOpenAll((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#00374a]/15 px-5 py-3 text-[13.5px] font-bold text-[#00374a] hover:border-[#00afdb] hover:bg-[#00afdb]/[0.06] transition-colors ${folded ? "-mt-2" : "mt-7"}`}
        >
          {folded ? `Show all ${days.length} days` : "Show fewer days"}
          <svg
            className={`w-4 h-4 text-[#f47b20] transition-transform ${folded ? "" : "rotate-180"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </>
  );
}
