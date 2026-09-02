/**
 * The rotating hero headlines, as data.
 *
 * Deliberately NOT in the client component next to it: every export of a
 * "use client" module is a client reference, so calling this from a server
 * component silently yields nothing. That is exactly how it shipped the first
 * time, and the homepage rendered with no headline at all while the build and
 * the types stayed perfectly happy.
 */
export type TaglinePair = { tagline: string; subline: string };

/**
 * Admin writes one pair per line as `BIG TEXT | small text`, which is the
 * fastest thing to edit and the hardest to get wrong. A line with no pipe is a
 * headline on its own.
 */
export function parseTaglines(raw: unknown): TaglinePair[] {
  if (typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      return i === -1
        ? { tagline: line, subline: "" }
        : { tagline: line.slice(0, i).trim(), subline: line.slice(i + 1).trim() };
    })
    .filter((p) => p.tagline);
}

/** Serialise back for the admin textarea. */
export function formatTaglines(pairs: TaglinePair[]): string {
  return pairs.map((p) => (p.subline ? `${p.tagline} | ${p.subline}` : p.tagline)).join("\n");
}
