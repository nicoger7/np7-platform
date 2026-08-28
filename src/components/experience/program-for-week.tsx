"use client";

import { Accordion, type AccordionItem } from "./accordion";
import { useSelectedEdition } from "./selected-edition";
import { programForEdition, type ProgramDay } from "@/lib/program-days";

export type { ProgramDay };

/** "Day 1" is a position in a list. "Day 1 · Sat 10 Oct" is a plan — you can
 *  see it against your own calendar, and book flights around it. */
function dayStamp(start: string | null | undefined, offset: number): string | null {
  if (!start) return null;
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The day-by-day for the week the visitor selected. Most weeks run the same
 * shape, so a week without its own program simply inherits the experience's —
 * only deliberately-customised weeks differ.
 */
export function ProgramForWeek({
  programByEdition, fallback, weekLabels, editionId, unit = "week",
  eyebrow, title, note, startDates, imagesByEdition,
}: {
  programByEdition: Record<string, ProgramDay[]>;
  fallback: ProgramDay[];
  weekLabels: Record<string, string>;
  /**
   * Pin this to one edition instead of following the page-wide selection.
   *
   * A clinic panel is server-rendered per run, so the run it describes is known
   * at render time. Reading the shared id there would reintroduce a way for the
   * panel and its program to describe different clinics — the selector falls
   * back to run 0 when the shared id is null, and this component would fall
   * back to the experience program on the same input.
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
  /** Edition id → the photos its day rows may use, by position (short lists
   *  repeat). Per edition, because a run's photos belong to its own place. */
  imagesByEdition?: Record<string, string[]>;
}) {
  const { id: ctxId } = useSelectedEdition();
  const id = editionId ?? ctxId;
  const custom = id ? programByEdition[id] : undefined;
  const days = programForEdition(programByEdition, fallback, id);
  const label = id ? weekLabels[id] : undefined;
  const multiWeek = Object.keys(weekLabels).length > 1;
  const start = id ? startDates?.[id] : null;
  const images = (id ? imagesByEdition?.[id] : null) ?? [];

  // Nothing to show is nothing to render. Trips always have the built-in
  // itinerary behind them, so this only ever fires for a clinic whose run and
  // series both have an empty program — where an empty accordion under a live
  // heading would read as a page that failed to load.
  if (days.length === 0) return null;

  const items: AccordionItem[] = days.map((d, i) => {
    const when = dayStamp(start, i);
    return {
      eyebrow: when ? `Day ${i + 1} · ${when}` : `Day ${i + 1}`,
      title: d.title?.trim() || `Day ${i + 1}`,
      content: <span className="whitespace-pre-line">{d.description}</span>,
      // The timeline card already knows how to carry a photo; giving each day
      // one turns a list of headings into something you want to open.
      image: images.length ? images[i % images.length] : undefined,
    };
  });

  return (
    <>
      {eyebrow && <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">{eyebrow}</p>}
      {title && <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-3">{title}</h2>}
      {note && <p className="text-[14.5px] text-[#7a8a90] leading-relaxed italic mb-8 max-w-[62ch]">{note}</p>}
      {multiWeek && label && (
        <p className="text-[13.5px] text-[#5a6b72] -mt-4 mb-6">
          The plan for <span className="font-bold text-[#00374a]">{label}</span>
          {custom?.length ? <span className="text-[#9aa6ac]"> · this {unit} runs its own schedule</span> : null}
        </p>
      )}
      <Accordion items={items} defaultOpen={0} variant="timeline" />
    </>
  );
}
