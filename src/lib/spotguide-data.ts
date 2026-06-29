/**
 * Spotguide public data layer. Reads with the service-role client (like
 * portal-data) so it can aggregate member ratings / forecast votes that aren't
 * anon-readable, then exposes only what the public pages render. Visibility is
 * enforced here: destinations need spotguide_status='published'; spots need
 * status='published' AND a public verification (community | np7).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase";
import {
  summariseRatings, np7Overall, tallyForecastVotes,
  SPOT_CRITERIA_KEYS, DESTINATION_CRITERIA_KEYS,
  type RatingSummary, type ForecastTally,
} from "@/lib/spotguide";

export type SpotguideDestinationCard = {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null;
  level_min: string | null; level_max: string | null;
  spotCount: number; np7: number; member: RatingSummary;
};

export type PublicSpot = {
  id: string; name: string; slug: string | null; lat: number | null; lng: number | null;
  level: string | null; conditions: string[]; wind_window: Record<string, string>;
  infrastructure: string[]; np7_forecast_models: string[];
  hero_image: string | null; gallery: string[]; summary: string | null; description: string | null;
  np7_ratings: Record<string, number>; verification: string;
  np7: number; member: RatingSummary; forecast: ForecastTally[];
};

export type SpotguideDestination = {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null; intro: string | null;
  level_min: string | null; level_max: string | null;
  np7_ratings: Record<string, number>; np7: number; member: RatingSummary;
  spots: PublicSpot[];
};

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
  const { data: dests } = await sb
    .from("destinations")
    .select("id, name, slug, region, country, hero_image, tagline, level_min, level_max, np7_ratings")
    .eq("spotguide_status", "published")
    .order("sort_order").order("name");
  if (!dests?.length) return [];
  const ids = dests.map((d: { id: string }) => d.id);

  const [{ data: spots }, { data: dratings }] = await Promise.all([
    sb.from("spots").select("destination_id").in("destination_id", ids).eq("status", "published").in("verification", ["community", "np7"]),
    sb.from("destination_ratings").select("destination_id, ratings").in("destination_id", ids),
  ]);
  const spotCounts = groupBy((spots ?? []) as { destination_id: string }[], (s) => s.destination_id);
  const ratingRows = groupBy((dratings ?? []) as { destination_id: string; ratings: unknown }[], (r) => r.destination_id);

  return dests.map((d: Record<string, unknown>) => ({
    id: d.id as string, name: d.name as string, slug: d.slug as string | null,
    region: d.region as string | null, country: d.country as string | null,
    hero_image: d.hero_image as string | null, tagline: d.tagline as string | null,
    level_min: d.level_min as string | null, level_max: d.level_max as string | null,
    spotCount: spotCounts.get(d.id as string)?.length ?? 0,
    np7: np7Overall(d.np7_ratings, DESTINATION_CRITERIA_KEYS),
    member: summariseRatings(ratingRows.get(d.id as string) ?? [], DESTINATION_CRITERIA_KEYS),
  }));
}

/** A destination page: the destination + its public spots, each fully rated. */
export async function getSpotguideDestination(slug: string): Promise<SpotguideDestination | null> {
  const sb = db();
  const { data: d } = await sb
    .from("destinations")
    .select("id, name, slug, region, country, hero_image, tagline, intro, level_min, level_max, np7_ratings, spotguide_status")
    .eq("slug", slug)
    .maybeSingle();
  if (!d || d.spotguide_status !== "published") return null;

  const { data: spotRows } = await sb
    .from("spots")
    .select("*")
    .eq("destination_id", d.id)
    .eq("status", "published")
    .in("verification", ["community", "np7"])
    .order("sort_order").order("name");
  const spots = spotRows ?? [];
  const spotIds = spots.map((s: { id: string }) => s.id);

  const [{ data: sratings }, { data: svotes }, { data: dratings }] = await Promise.all([
    spotIds.length ? sb.from("spot_ratings").select("spot_id, ratings").in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    spotIds.length ? sb.from("spot_forecast_votes").select("spot_id, model").in("spot_id", spotIds) : Promise.resolve({ data: [] }),
    sb.from("destination_ratings").select("ratings").eq("destination_id", d.id),
  ]);
  const ratingsBySpot = groupBy((sratings ?? []) as { spot_id: string; ratings: unknown }[], (r) => r.spot_id);
  const votesBySpot = groupBy((svotes ?? []) as { spot_id: string; model: string }[], (r) => r.spot_id);

  const publicSpots: PublicSpot[] = spots.map((s: Record<string, unknown>) => ({
    id: s.id as string, name: s.name as string, slug: s.slug as string | null,
    lat: (s.lat as number) ?? null, lng: (s.lng as number) ?? null, level: (s.level as string) ?? null,
    conditions: (s.conditions as string[]) ?? [], wind_window: (s.wind_window as Record<string, string>) ?? {},
    infrastructure: (s.infrastructure as string[]) ?? [], np7_forecast_models: (s.np7_forecast_models as string[]) ?? [],
    hero_image: (s.hero_image as string) ?? null, gallery: (s.gallery as string[]) ?? [],
    summary: (s.summary as string) ?? null, description: (s.description as string) ?? null,
    np7_ratings: (s.np7_ratings as Record<string, number>) ?? {}, verification: s.verification as string,
    np7: np7Overall(s.np7_ratings, SPOT_CRITERIA_KEYS),
    member: summariseRatings(ratingsBySpot.get(s.id as string) ?? [], SPOT_CRITERIA_KEYS),
    forecast: tallyForecastVotes(votesBySpot.get(s.id as string) ?? []),
  }));

  return {
    id: d.id, name: d.name, slug: d.slug, region: d.region, country: d.country,
    hero_image: d.hero_image, tagline: d.tagline, intro: d.intro,
    level_min: d.level_min, level_max: d.level_max, np7_ratings: d.np7_ratings ?? {},
    np7: np7Overall(d.np7_ratings, DESTINATION_CRITERIA_KEYS),
    member: summariseRatings(dratings ?? [], DESTINATION_CRITERIA_KEYS),
    spots: publicSpots,
  };
}

/** Slugs for static generation / sitemap. */
export async function getSpotguideSlugs(): Promise<string[]> {
  const { data } = await db().from("destinations").select("slug").eq("spotguide_status", "published");
  return (data ?? []).map((r: { slug: string | null }) => r.slug).filter(Boolean) as string[];
}
