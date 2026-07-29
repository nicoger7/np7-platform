/**
 * Spotguide public data layer. Reads with the service-role client (like
 * portal-data) so it can aggregate member ratings / forecast votes that aren't
 * anon-readable, then exposes only what the public pages render. Visibility is
 * enforced here: destinations need spotguide_status='published'; spots need
 * status='published' AND a public verification (community | np7).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { satImage } from "./satellite";
import {
  summariseRatings, np7Overall, tallyForecastVotes,
  crowdWindow, levelConsensus, conditionsTally, infraTally,
  SPOT_CRITERIA_KEYS, DESTINATION_CRITERIA_KEYS,
  type RatingSummary, type ForecastTally,
  type CrowdWindow, type LevelConsensus, type ConditionShare, type InfraShare,
} from "@/lib/spotguide";
import type { WindStats } from "@/lib/wind-stats";

export type SpotguideDestinationCard = {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; image: string; tagline: string | null;
  level_min: string | null; level_max: string | null; tags: string[];
  spotCount: number; np7: number; member: RatingSummary;
};

export type PublicSpot = {
  id: string; name: string; slug: string | null; lat: number | null; lng: number | null;
  level: string | null; levels: string[]; conditions: string[]; wind_window: Record<string, string>;
  infrastructure: string[]; np7_forecast_models: string[];
  hero_image: string | null; hero_focus: string | null; gallery: string[]; summary: string | null; description: string | null;
  np7_ratings: Record<string, number>; verification: string;
  wind_stats: WindStats | null;
  photos: { id: string; url: string; caption: string | null; score: number; source: string }[];
  np7: number; member: RatingSummary; forecast: ForecastTally[];
  // crowd-aggregated member facts
  crowdWindow: CrowdWindow; memberLevel: LevelConsensus; memberConditions: { shares: ConditionShare[]; raters: number };
  memberInfra: { shares: InfraShare[]; raters: number };
  ownPending?: boolean; // the viewer's OWN not-yet-public spot (badged "under review · only you")
  teamPending?: boolean; // someone else's pending spot, visible because the viewer is team
  /** Contributor credit: riders who confirmed this spot's facts ("Jan K."), shown publicly. */
  confirmedBy: { names: string[]; count: number };
};

export type SpotguideTrip = { id: string; title: string; slug: string; hero_image: string | null; tagline: string | null };
export type SpotguideDestination = {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null; intro: string | null;
  hero_video_url: string | null; hero_video_start: number | null; hero_video_end: number | null;
  level_min: string | null; level_max: string | null; gallery: string[];
  lat: number | null; lng: number | null;
  np7_ratings: Record<string, number>; np7: number; member: RatingSummary;
  spots: PublicSpot[]; trips: SpotguideTrip[];
  /** Topic cluster: published magazine stories that mention this destination. */
  articles: { slug: string; title: string; cover_image: string | null; category: string | null }[];
  /** 'draft' = rider-proposed area, visible to members only, verifiable at the bottom. */
  status: "draft" | "published";
  submitted_by: string | null;
  verify: { confirms: number; flags: number; mine: "confirm" | "flag" | null } | null;
};

// Satellite fallback for a photo-less destination/spot lives in src/lib/satellite.ts
// (pure, so client components can share it). Import satImage from there directly.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createAdminClient() as any; }

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); }
  return m;
}

/** Index: every destination whose spotguide is live, with a headline rating. */
export async function getSpotguideDestinations(): Promise<SpotguideDestinationCard[]> {
  const sb = db();
  const BASE = "id, name, slug, region, country, hero_image, tagline, level_min, level_max, np7_ratings, lat, lng";
  // tags ships with migration 076 — fall back to the base columns until applied.
  let dests: Record<string, unknown>[] | null = null;
  ({ data: dests } = await sb.from("destinations").select(BASE + ", tags").eq("spotguide_status", "published").order("sort_order").order("name"));
  if (!dests) ({ data: dests } = await sb.from("destinations").select(BASE).eq("spotguide_status", "published").order("sort_order").order("name"));
  if (!dests?.length) return [];
  const ids = dests.map((d) => d.id as string);

  const [{ data: spots }, { data: dratings }] = await Promise.all([
    sb.from("spots").select("destination_id, hero_image").in("destination_id", ids).eq("status", "published").in("verification", ["community", "np7"]).order("sort_order"),
    sb.from("destination_ratings").select("destination_id, ratings").in("destination_id", ids),
  ]);
  const spotsByDest = groupBy((spots ?? []) as { destination_id: string; hero_image: string | null }[], (s) => s.destination_id);
  const ratingRows = groupBy((dratings ?? []) as { destination_id: string; ratings: unknown }[], (r) => r.destination_id);

  return dests.map((d: Record<string, unknown>) => {
    const id = d.id as string;
    const lat = d.lat as number | null, lng = d.lng as number | null;
    // The card image mirrors the page hero: destination photo → a spot's photo →
    // a satellite view of the area → the branded default. Never a blank tile.
    const spotHero = (spotsByDest.get(id) ?? []).map((s) => s.hero_image).find(Boolean) ?? null;
    const image =
      (d.hero_image as string | null) ||
      spotHero ||
      (lat != null && lng != null ? satImage(lat, lng) : null) ||
      "https://media.np-seven.com/experiences/np7-bonaire/place/bonaire-spot-overview-drone-shot.jpg";
    return {
    id, name: d.name as string, slug: d.slug as string | null,
    region: d.region as string | null, country: d.country as string | null,
    hero_image: d.hero_image as string | null, image, tagline: d.tagline as string | null,
    level_min: d.level_min as string | null, level_max: d.level_max as string | null,
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    spotCount: (spotsByDest.get(id)?.length) ?? 0,
    np7: np7Overall(d.np7_ratings, DESTINATION_CRITERIA_KEYS),
    member: summariseRatings(ratingRows.get(id) ?? [], DESTINATION_CRITERIA_KEYS),
    };
  });
}

/** A destination page: the destination + its public spots, each fully rated. */
export async function getSpotguideDestination(slug: string, viewerId?: string | null, isTeam = false): Promise<SpotguideDestination | null> {
  const sb = db();
  const { data: d } = await sb
    .from("destinations")
    // select("*") so the hero_video_* columns (migration 073) flow through when
    // present without breaking before it's applied (they're just undefined then).
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!d) return null;
  const isDraft = d.spotguide_status !== "published";
  // A rider-proposed area stays a DRAFT until verified — but it must be
  // REACHABLE by members, or its first spots could never collect the
  // verifications that publish both (chicken-and-egg). Admin-only drafts
  // (no submitter) and anonymous visitors still get a 404.
  if (isDraft && !(viewerId && d.submitted_by)) return null;

  const { data: spotRows } = await sb
    .from("spots")
    .select("*")
    .eq("destination_id", d.id)
    .eq("status", "published")
    .in("verification", ["community", "np7"])
    // Spots are listed A→Z (predictable) — sort_order was arbitrary. (Switch the
    // primary key to a rating/verification order here if "best first" is wanted.)
    .order("name");
  let spots = spotRows ?? [];
  // A logged-in member also sees their OWN not-yet-public spots here (badged
  // "under review"), so they can keep enriching a spot they just added until the
  // community verifies it — instead of it vanishing the moment they submit.
  //  …and the TEAM sees every pending spot on the area, so a contribution is
  //  reachable from the destination it belongs to — not only from the queue.
  const ownPendingIds = new Set<string>();
  const teamPendingIds = new Set<string>();
  if (viewerId || isTeam) {
    let q = sb.from("spots").select("*")
      .eq("destination_id", d.id)
      .eq("status", "published").eq("verification", "pending");
    if (!isTeam) q = q.eq("submitted_by", viewerId);
    const { data: mine } = await q.order("name");
    const have = new Set(spots.map((s: { id: string }) => s.id));
    const extra = ((mine ?? []) as { id: string; submitted_by?: string | null }[]).filter((m) => !have.has(m.id));
    for (const m of extra) {
      if (viewerId && m.submitted_by === viewerId) ownPendingIds.add(m.id);
      else teamPendingIds.add(m.id); // a member's spot, shown because you're team
    }
    spots = [...spots, ...extra];
  }
  const spotIds = spots.map((s: { id: string }) => s.id);

  const [{ data: sratings }, { data: svotes }, { data: dratings }, { data: trips }] = await Promise.all([
    spotIds.length ? sb.from("spot_ratings").select("*").in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    spotIds.length ? sb.from("spot_forecast_votes").select("spot_id, model").in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    sb.from("destination_ratings").select("ratings").eq("destination_id", d.id),
    sb.from("exp_experiences").select("id, title, slug, hero_image, tagline, status").eq("destination_id", d.id).eq("status", "published"),
  ]);
  const { data: sphotos } = spotIds.length
    ? await sb.from("spot_photos").select("id, spot_id, url, caption, source, sort_order").in("spot_id", spotIds).eq("status", "approved").order("sort_order")
    : { data: [] };

  // Contributor credit — who confirmed each spot's facts. First name + last
  // initial only ("Jan K."): public page, so never the full name.
  const confirmsBySpot = new Map<string, { names: string[]; count: number }>();
  if (spotIds.length) {
    const { data: sv } = await sb.from("spot_verifications").select("spot_id, contact_id").eq("kind", "confirm").in("spot_id", spotIds);
    const rows = (sv ?? []) as { spot_id: string; contact_id: string }[];
    const contactIds = [...new Set(rows.map((r) => r.contact_id))];
    const { data: cs } = contactIds.length ? await sb.from("contacts").select("id, name").in("id", contactIds) : { data: [] };
    const credit = new Map<string, string>();
    for (const c of (cs ?? []) as { id: string; name: string | null }[]) {
      const parts = String(c.name ?? "").trim().split(/\s+/).filter(Boolean);
      if (parts.length) credit.set(c.id, parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]);
    }
    for (const spotId of new Set(rows.map((r) => r.spot_id))) {
      const ids = [...new Set(rows.filter((r) => r.spot_id === spotId).map((r) => r.contact_id))];
      confirmsBySpot.set(spotId, { names: ids.map((id) => credit.get(id)).filter(Boolean) as string[], count: ids.length });
    }
  }
  const photoIds = (sphotos ?? []).map((p: { id: string }) => p.id);
  const { data: pvotes } = photoIds.length
    ? await sb.from("spot_photo_votes").select("photo_id, value").in("photo_id", photoIds)
    : { data: [] };
  const scoreByPhoto = new Map<string, number>();
  for (const v of (pvotes ?? []) as { photo_id: string; value: number }[]) scoreByPhoto.set(v.photo_id, (scoreByPhoto.get(v.photo_id) ?? 0) + (v.value || 0));

  const ratingsBySpot = groupBy((sratings ?? []) as { spot_id: string; ratings: unknown; level?: string | null; conditions?: string[] | null; infrastructure?: string[] | null; wind_window?: unknown }[], (r) => r.spot_id);
  const votesBySpot = groupBy((svotes ?? []) as { spot_id: string; model: string }[], (r) => r.spot_id);
  const photosBySpot = groupBy((sphotos ?? []) as { id: string; spot_id: string; url: string; caption: string | null; source: string }[], (r) => r.spot_id);

  const publicSpots: PublicSpot[] = spots.map((s: Record<string, unknown>) => ({
    id: s.id as string, name: s.name as string, slug: s.slug as string | null,
    lat: (s.lat as number) ?? null, lng: (s.lng as number) ?? null, level: (s.level as string) ?? null,
    levels: Array.isArray(s.levels) && (s.levels as string[]).length ? (s.levels as string[]) : ((s.level as string) ? [s.level as string] : []),
    conditions: (s.conditions as string[]) ?? [], wind_window: (s.wind_window as Record<string, string>) ?? {},
    infrastructure: (s.infrastructure as string[]) ?? [], np7_forecast_models: (s.np7_forecast_models as string[]) ?? [],
    hero_image: (s.hero_image as string) ?? null, hero_focus: (s.hero_focus as string) ?? null, gallery: (s.gallery as string[]) ?? [],
    summary: (s.summary as string) ?? null, description: (s.description as string) ?? null,
    np7_ratings: (s.np7_ratings as Record<string, number>) ?? {}, verification: s.verification as string,
    wind_stats: (s.wind_stats as WindStats) ?? null,
    photos: (photosBySpot.get(s.id as string) ?? [])
      .map((p) => ({ id: p.id, url: p.url, caption: p.caption, source: p.source, score: scoreByPhoto.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score),
    np7: np7Overall(s.np7_ratings, SPOT_CRITERIA_KEYS),
    member: summariseRatings(ratingsBySpot.get(s.id as string) ?? [], SPOT_CRITERIA_KEYS),
    forecast: tallyForecastVotes(votesBySpot.get(s.id as string) ?? []),
    crowdWindow: crowdWindow(ratingsBySpot.get(s.id as string) ?? []),
    memberLevel: levelConsensus(ratingsBySpot.get(s.id as string) ?? []),
    memberConditions: conditionsTally(ratingsBySpot.get(s.id as string) ?? []),
    memberInfra: infraTally(ratingsBySpot.get(s.id as string) ?? []),
    ownPending: ownPendingIds.has(s.id as string),
    teamPending: teamPendingIds.has(s.id as string),
    confirmedBy: confirmsBySpot.get(s.id as string) ?? { names: [], count: 0 },
  }));

  // Draft areas carry their verification tally (the bottom-of-page ladder).
  let verify: SpotguideDestination["verify"] = null;
  if (isDraft) {
    const { data: dv } = await sb.from("destination_verifications").select("contact_id, kind").eq("destination_id", d.id);
    const vrows = (dv ?? []) as { contact_id: string; kind: string }[];
    verify = {
      confirms: new Set(vrows.filter((r) => r.kind === "confirm").map((r) => r.contact_id)).size,
      flags: new Set(vrows.filter((r) => r.kind === "flag").map((r) => r.contact_id)).size,
      mine: (vrows.find((r) => r.contact_id === viewerId)?.kind as "confirm" | "flag" | undefined) ?? null,
    };
  }

  // Topic cluster: stories that mention this destination by name (title/
  // excerpt/content). Modest ilike — 3 links is all the cluster needs.
  let articles: SpotguideDestination["articles"] = [];
  if (d.name && String(d.name).length > 3) {
    const pat = `%${String(d.name).replace(/[%_,()]/g, "")}%`;
    const { data: arts } = await sb.from("exp_blog_posts")
      .select("slug, title, cover_image, category")
      .eq("status", "published")
      // legacy spotguide-template posts redirect INTO the spotguide — linking
      // them from here would just bounce the reader back
      .neq("template", "spotguide")
      .or(`title.ilike.${pat},excerpt.ilike.${pat},content.ilike.${pat}`)
      .order("published_at", { ascending: false }).limit(3);
    articles = (arts ?? []) as SpotguideDestination["articles"];
  }

  return {
    status: isDraft ? "draft" : "published",
    submitted_by: (d.submitted_by as string | null) ?? null,
    verify,
    articles,
    id: d.id, name: d.name, slug: d.slug, region: d.region, country: d.country,
    hero_image: d.hero_image, tagline: d.tagline, intro: d.intro,
    hero_video_url: d.hero_video_url ?? null,
    hero_video_start: d.hero_video_start ?? null,
    hero_video_end: d.hero_video_end ?? null,
    level_min: d.level_min, level_max: d.level_max, gallery: (d.gallery as string[]) ?? [],
    lat: (d.lat as number) ?? null, lng: (d.lng as number) ?? null,
    np7_ratings: d.np7_ratings ?? {},
    np7: np7Overall(d.np7_ratings, DESTINATION_CRITERIA_KEYS),
    member: summariseRatings(dratings ?? [], DESTINATION_CRITERIA_KEYS),
    spots: publicSpots,
    trips: (trips ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string, title: t.title as string, slug: t.slug as string,
      hero_image: (t.hero_image as string) ?? null, tagline: (t.tagline as string) ?? null,
    })),
  };
}

export type SpotMapPoint = {
  lat: number; lng: number; name: string; destSlug: string; destName: string; verification: string;
  /** The SPOT's own score (NP7's if set, else the member average) — distinct
      from the destination rating the index popup also shows. */
  spotRating?: number; spotRatingKind?: "np7" | "member"; spotRatingCount?: number;
};

/** Every public spot with coordinates, across live destinations — for the map. */
export async function getAllSpotguidePoints(): Promise<SpotMapPoint[]> {
  const sb = db();
  const { data: dests } = await sb.from("destinations").select("id, name, slug").eq("spotguide_status", "published");
  if (!dests?.length) return [];
  const byId = new Map((dests as { id: string; name: string; slug: string | null }[]).map((d) => [d.id, d]));
  const { data: spots } = await sb
    .from("spots")
    .select("id, name, lat, lng, destination_id, verification, np7_ratings")
    .in("destination_id", [...byId.keys()])
    .eq("status", "published").in("verification", ["community", "np7"])
    .not("lat", "is", null);
  // Member ratings for these spots, in one query — the pin card shows the
  // spot's OWN score, not just the destination's.
  const spotIds = (spots ?? []).map((s: Record<string, unknown>) => s.id as string);
  const ratingsBySpot = new Map<string, { ratings: unknown }[]>();
  if (spotIds.length) {
    const { data: rrows } = await sb.from("spot_ratings").select("spot_id, ratings").in("spot_id", spotIds);
    for (const r of (rrows ?? []) as { spot_id: string; ratings: unknown }[]) {
      ratingsBySpot.set(r.spot_id, [...(ratingsBySpot.get(r.spot_id) ?? []), r]);
    }
  }
  return (spots ?? [])
    .map((s: Record<string, unknown>) => {
      const d = byId.get(s.destination_id as string);
      if (!d?.slug) return null;
      const np7 = np7Overall((s.np7_ratings as Record<string, number>) ?? {}, SPOT_CRITERIA_KEYS);
      const member = summariseRatings(ratingsBySpot.get(s.id as string) ?? [], SPOT_CRITERIA_KEYS);
      const spotRating = np7 > 0 ? np7 : member.overall;
      return {
        lat: s.lat as number, lng: s.lng as number, name: s.name as string,
        destSlug: d.slug, destName: d.name, verification: s.verification as string,
        ...(spotRating > 0
          ? { spotRating, spotRatingKind: (np7 > 0 ? "np7" : "member") as "np7" | "member", spotRatingCount: member.count }
          : {}),
      };
    })
    .filter(Boolean) as SpotMapPoint[];
}

/** Slugs for static generation / sitemap. */
export async function getSpotguideSlugs(): Promise<string[]> {
  const { data } = await db().from("destinations").select("slug").eq("spotguide_status", "published");
  return (data ?? []).map((r: { slug: string | null }) => r.slug).filter(Boolean) as string[];
}
