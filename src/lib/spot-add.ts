/**
 * What the add-a-spot form says and links to once a spot is saved
 * (Nico, 6 Oct 2026). Pure, so the wording rules are tested.
 *
 * It used to say "only you can see it for now" to everyone, including the
 * riders whose spot went live on the spot (a local specialist, or a pin next
 * to one NP7 verified). And it pointed "above" to a spot the cached
 * destination page had not loaded yet, so it wasn't there. Now the message
 * follows what the server actually did, and the link opens the spot itself.
 */

export type PhotoOutcome = "none" | "posted" | "failed";

export type AddedSpot = {
  id: string;
  slug?: string | null;
  destSlug?: string | null;
  /** The spot sits in a rider-proposed area that is not public yet. */
  destDraft?: boolean;
  /** spots.verification as saved: "pending" waits for riders, "community"/"np7" is public. */
  verification?: string | null;
  /** Auto-published: the pin is live, the description waits for a human. */
  wordsHeld?: boolean;
  photo: PhotoOutcome;
};

/** The spot's own place in the guide (its anchor opens and scrolls to it), or null. */
export function spotHref(s: AddedSpot): string | null {
  if (!s.destSlug) return null;
  const page = s.destDraft ? `/spotguide/proposed/${s.destSlug}` : `/spotguide/${s.destSlug}`;
  return `${page}#spot-${s.slug || s.id}`;
}

export function addedNotice(s: AddedSpot): { title: string; lines: string[] } {
  const lines: string[] = [];
  const isPublic = (s.verification === "community" || s.verification === "np7") && !s.destDraft;

  let title: string;
  if (s.destDraft) {
    title = "Your spot and new area are in. Thank you!";
    lines.push("Members can see the new area now. Once riders confirm it, it goes public.");
  } else if (isPublic) {
    title = "Your spot is live. Thank you!";
    if (s.wordsHeld) lines.push("Your description shows once someone has checked it.");
  } else {
    title = "Your spot is in. Thank you!";
    lines.push("Only you can see it for now. Once a few riders confirm it, it goes live for everyone.");
  }

  if (s.photo === "posted") lines.push(isPublic ? "Your photo is up too." : "Your photo goes live with it.");
  if (s.photo === "failed") lines.push("The photo did not upload. Open your spot and add it there.");
  return { title, lines };
}
