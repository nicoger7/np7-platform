"use client";

import { Accordion, type AccordionItem } from "./accordion";
import { useSelectedEdition } from "./selected-edition";
import { programForEdition, type ProgramDay } from "@/lib/program-days";

export type { ProgramDay };


/**
 * The day-by-day for the week the visitor selected. Most weeks run the same
 * shape, so a week without its own program simply inherits the experience's —
 * only deliberately-customised weeks differ.
 */
export function ProgramForWeek({
  programByEdition, fallback, weekLabels, editionId, unit = "week",
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
}) {
  const { id: ctxId } = useSelectedEdition();
  const id = editionId ?? ctxId;
  const custom = id ? programByEdition[id] : undefined;
  const days = programForEdition(programByEdition, fallback, id);
  const label = id ? weekLabels[id] : undefined;
  const multiWeek = Object.keys(weekLabels).length > 1;

  // Nothing to show is nothing to render. Trips always have the built-in
  // itinerary behind them, so this only ever fires for a clinic whose run and
  // series both have an empty program — where an empty accordion under a live
  // heading would read as a page that failed to load.
  if (days.length === 0) return null;

  const items: AccordionItem[] = days.map((d, i) => ({
    eyebrow: `Day ${i + 1}`,
    title: d.title?.trim() || `Day ${i + 1}`,
    content: <span className="whitespace-pre-line">{d.description}</span>,
  }));

  return (
    <>
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
