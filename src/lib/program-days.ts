export type ProgramDay = { title: string; description: string };

/**
 * Which day-by-day a given edition runs: its own when it has one, the
 * experience's otherwise.
 *
 * Lives here rather than beside the component because BOTH sides need it. The
 * server has to know whether there are any days before it renders a "Day by
 * day" heading — a heading with nothing under it reads as a page that failed to
 * load — and the client component needs the same answer to render them. A
 * second copy of "custom wins when non-empty" would eventually disagree with
 * the first, and the disagreement would show up as a heading over an empty box.
 *
 * (It cannot live in the component file: that module is "use client", and a
 * server component may not call a function exported from one.)
 */
export function programForEdition(
  programByEdition: Record<string, ProgramDay[]>,
  fallback: ProgramDay[],
  id: string | null | undefined,
): ProgramDay[] {
  const custom = id ? programByEdition[id] : undefined;
  return custom?.length ? custom : fallback;
}
