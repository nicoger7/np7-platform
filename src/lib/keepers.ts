/**
 * How many photos (and how many clips) a member may keep forever.
 *
 * Keepers are the exception to the retention sweep — photos go a year after the
 * trip, videos three months, and a starred one never goes at all. That is
 * storage NP7 pays for in perpetuity, so it is deliberately a small number: the
 * point is "pick your three favourites", not "opt out of the purge".
 *
 * The cap was decided long before it was built, and in the gap members starred
 * freely — one booking reached 44. So it is enforced on the SERVER, where it
 * cannot be clicked around, and only surfaced in the UI as a courtesy.
 *
 * Counted PER KIND, because photos and videos have different retention windows
 * and live in separate grids: three photos and three clips, not three of both.
 *
 * Plain constant, no server-only import — both the API route and the two client
 * grids read it, and a second copy would eventually disagree with the first.
 */
export const KEEPER_LIMIT = 3;

/** "photos" / "clips" — for messages the member actually reads. */
export function keeperNoun(kind: "photo" | "video", n = KEEPER_LIMIT): string {
  const word = kind === "video" ? "clip" : "photo";
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The one sentence shown when someone tries to keep a fourth. */
export function keeperLimitMessage(kind: "photo" | "video"): string {
  return `You can keep ${keeperNoun(kind)} forever — unstar one to swap it.`;
}
