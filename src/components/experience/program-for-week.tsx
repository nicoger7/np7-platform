"use client";

import { Accordion, type AccordionItem } from "./accordion";
import { useSelectedEdition } from "./selected-edition";

export type ProgramDay = { title: string; description: string };

/**
 * The day-by-day for the week the visitor selected. Most weeks run the same
 * shape, so a week without its own program simply inherits the experience's —
 * only deliberately-customised weeks differ.
 */
export function ProgramForWeek({
  programByEdition, fallback, weekLabels,
}: {
  programByEdition: Record<string, ProgramDay[]>;
  fallback: ProgramDay[];
  weekLabels: Record<string, string>;
}) {
  const { id } = useSelectedEdition();
  const custom = id ? programByEdition[id] : undefined;
  const days = custom?.length ? custom : fallback;
  const label = id ? weekLabels[id] : undefined;
  const multiWeek = Object.keys(weekLabels).length > 1;

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
          {custom?.length ? <span className="text-[#9aa6ac]"> · this week runs its own schedule</span> : null}
        </p>
      )}
      <Accordion items={items} defaultOpen={0} variant="timeline" />
    </>
  );
}
