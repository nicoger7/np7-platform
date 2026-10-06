/**
 * Pure helpers behind the spotguide's first-run moments (Nico, 6 Oct 2026).
 *
 * His new-user walkthrough found three things that made a working guide feel
 * abandoned: nothing happened right after sign-up, every spot row said "No
 * member ratings yet", and photo-less destinations showed as dark satellite
 * tiles. The decisions behind the fixes live here, with no server imports,
 * because the provider, the spot list and the index cards all run them in the
 * browser and the tests run them in node.
 */

/* ------------------------------------------------------------------ */
/* Welcome after sign-up                                               */
/* ------------------------------------------------------------------ */

/**
 * Anchor ids the welcome strip and the member home's setup step aim at:
 * the add-a-spot block and the spots (or, on the index, the map). Here and
 * not in the client component, because a server page importing a constant
 * from a "use client" module gets a client reference, not the string.
 */
export const ADD_SPOT_ANCHOR = "sg-add-spot";
export const SPOTS_ANCHOR = "sg-spots";

/**
 * The window event that asks the add-a-spot form to open (add-spot-open.ts).
 * The form listens for it instead of having its button pressed from outside:
 * a pressed "first button" turned out to be whatever the form shows first,
 * which after a submit is a link to the new spot, not an empty form.
 */
export const ADD_SPOT_OPEN_EVENT = "np7:add-spot-open";

/**
 * How old an account may be and still count as "just joined".
 *
 * Sign-up is a magic link: the account exists the moment the form is sent, the
 * rider opens the mail minutes (sometimes hours) later. A day covers a slow
 * inbox without greeting a long-standing member as new. The once-only flag
 * (welcomeSeenKey) is what stops a repeat inside that day.
 */
export const FRESH_ACCOUNT_HOURS = 24;

export function isFreshAccount(
  createdAt: string | null | undefined,
  now: number = Date.now(),
  hours: number = FRESH_ACCOUNT_HOURS,
): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  // a few minutes of clock skew between the auth server and the phone is normal
  return age >= -5 * 60_000 && age <= hours * 3_600_000;
}

/** Per member, so a shared family laptop still greets the second rider. */
export const welcomeSeenKey = (userId: string) => `np7_sg_welcome_${userId}`;

/** "You're in, Nico." from whatever name we hold; never a stray comma when we hold none. */
export function welcomeHeadline(firstName?: string | null): string {
  const n = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  return n ? `You're in, ${n}.` : "You're in.";
}

/* ------------------------------------------------------------------ */
/* "Add your home spot" on the member home                             */
/* ------------------------------------------------------------------ */

/**
 * The cookie a "Not now" on that step sets. A cookie, not localStorage, because
 * the server builds the checklist: it drops the step before the page is drawn,
 * so the count is right and a finished strip never flashes back for a moment.
 */
export const SPOT_STEP_SKIP_COOKIE = "np7_skip_spot_step";

/**
 * Does the member home's setup list carry "Add your home spot"?
 *
 * The list is "the profile is done" and removes itself when it is, so a set-up
 * member is never nagged. An extra step for everyone would bring "1 step to go"
 * back to every finished member, trip guests who never open the spotguide
 * included, for good. So only riders with no booking get it: they joined for
 * the community and the guide, and this is their next move. One "Not now"
 * removes it. And only while the spotguide is public, since the step links in.
 */
export function showHomeSpotStep(o: { spotguideLive: boolean; bookingCount: number; skipped: boolean }): boolean {
  return o.spotguideLive && o.bookingCount === 0 && !o.skipped;
}

/* ------------------------------------------------------------------ */
/* "Be the first to rate"                                              */
/* ------------------------------------------------------------------ */

/**
 * The ONE spot row that carries a "Be the first to rate" invite.
 *
 * On every unrated row it would be as loud as the grey "No member ratings yet"
 * it replaces, just in a brighter colour. So only the first spot in the list
 * that no member has rated, and that this member has not rated either, gets it.
 * Rating that one moves the invite down to the next, which is the whole loop.
 * Pending spots are skipped: they are not public, and the submitter rating
 * their own spot is not the crowd.
 */
export function firstUnratedSpotId(
  spots: { id: string; member: { count: number }; ownPending?: boolean; teamPending?: boolean }[],
  ratedByMe: (spotId: string) => boolean,
): string | null {
  for (const s of spots) {
    if (s.ownPending || s.teamPending) continue;
    if (s.member.count > 0) continue;
    if (ratedByMe(s.id)) continue;
    return s.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Card photos                                                         */
/* ------------------------------------------------------------------ */

/** Is this card image the Esri satellite fallback (through our /api/sat cache, or raw)? */
export function isSatelliteImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/api/sat") || url.includes("/api/sat?") || url.includes("arcgisonline.com");
}

/**
 * A magazine cover for a destination: the newest post whose TITLE names it.
 * Title, not body: a story that only mentions Tenerife in passing usually has
 * somebody else's water on its cover. Names under four letters match too much
 * ("Ria", "Bol") to trust.
 */
export function blogCoverFor(
  name: string,
  posts: { title: string | null; cover_image: string | null }[],
): string | null {
  const n = name.trim().toLowerCase();
  if (n.length < 4) return null;
  for (const p of posts) {
    if (p.cover_image && (p.title ?? "").toLowerCase().includes(n)) return p.cover_image;
  }
  return null;
}

/**
 * The best real photo we hold for a destination, or null.
 * Order = how surely the picture shows THIS place: the destination's own
 * gallery, then its spots' curated galleries, then photos NP7 added to a spot,
 * then a magazine cover named after it. `spotPhotos` must hold NP7's own spot
 * photos only: a member upload is live the moment it is sent, with nobody
 * reviewing it, so it is no card for a whole destination (the caller,
 * spotguide-card-photos.ts, filters on source 'np7').
 */
export function pickRealPhoto(src: {
  gallery?: (string | null)[] | null;
  spotGalleries?: ((string | null)[] | null)[] | null;
  spotPhotos?: (string | null)[] | null;
  blogCover?: string | null;
}): string | null {
  const real = (u: string | null | undefined): u is string => !!u && !!u.trim() && !isSatelliteImage(u);
  const candidates = [
    ...(src.gallery ?? []),
    ...(src.spotGalleries ?? []).flatMap((g) => g ?? []),
    ...(src.spotPhotos ?? []),
    src.blogCover ?? null,
  ];
  return candidates.find(real) ?? null;
}
