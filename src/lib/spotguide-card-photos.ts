/**
 * Real photos for destination cards that would otherwise show a satellite tile.
 *
 * Nico, 6 Oct 2026: on the index, every destination without a hero image fell
 * through to a satellite view (spotguide-data.ts: destination photo, then a
 * spot's hero, then satellite). Most cards in the grid were dark overhead
 * tiles and the guide read like an abandoned project, although many of those
 * places DO have photos, just not in the two fields that fallback looks at.
 *
 * This looks further, only for the cards that need it: the destination's own
 * gallery, its public spots' galleries, rider photos the team approved, and a
 * magazine cover named after the place (pickRealPhoto decides the order). A
 * card with none of those keeps its satellite tile, which the card itself now
 * shows in a lighter, branded treatment (dest-card-image.tsx).
 *
 * Kept beside spotguide-data.ts rather than inside it so the data layer's own
 * query stays as it is. Any failure returns the cards unchanged: a picture is
 * never worth a broken index.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { isSatelliteImage, pickRealPhoto, blogCoverFor } from "@/lib/spotguide-nudge";

type Row = Record<string, unknown>;

export async function withRealCardPhotos<T extends { id: string; name: string; image: string }>(cards: T[]): Promise<T[]> {
  const sat = cards.filter((c) => isSatelliteImage(c.image));
  if (sat.length === 0) return cards;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createAdminClient() as any;
    const ids = sat.map((c) => c.id);
    // PostgREST's or() is comma and bracket delimited; strip what would break it.
    const names = [...new Set(sat.map((c) => c.name.replace(/[%_,()."\\*]/g, "").trim()).filter((n) => n.length >= 4))];

    const [destRes, spotRes, postRes] = await Promise.all([
      sb.from("destinations").select("id, gallery").in("id", ids),
      // public spots only: a pending spot's pictures are not public yet either
      sb.from("spots").select("id, destination_id, gallery")
        .in("destination_id", ids).eq("status", "published").in("verification", ["community", "np7"])
        .order("sort_order"),
      names.length
        ? sb.from("exp_blog_posts").select("title, cover_image")
            .eq("status", "published").not("cover_image", "is", null)
            .or(names.map((n) => `title.ilike.%${n}%`).join(","))
            .order("published_at", { ascending: false }).limit(100)
        : Promise.resolve({ data: [] }),
    ]);

    const spots = (spotRes?.data ?? []) as Row[];
    const spotIds = spots.map((s) => s.id as string);
    const photoRes = spotIds.length
      ? await sb.from("spot_photos").select("spot_id, url").in("spot_id", spotIds).eq("status", "approved").order("sort_order")
      : { data: [] };

    const galleryByDest = new Map<string, string[]>();
    for (const d of (destRes?.data ?? []) as Row[]) {
      if (Array.isArray(d.gallery)) galleryByDest.set(d.id as string, d.gallery as string[]);
    }
    const destOfSpot = new Map<string, string>();
    const spotGalleriesByDest = new Map<string, string[][]>();
    for (const s of spots) {
      const dest = s.destination_id as string;
      destOfSpot.set(s.id as string, dest);
      if (Array.isArray(s.gallery)) spotGalleriesByDest.set(dest, [...(spotGalleriesByDest.get(dest) ?? []), s.gallery as string[]]);
    }
    const photosByDest = new Map<string, string[]>();
    for (const p of (photoRes?.data ?? []) as Row[]) {
      const dest = destOfSpot.get(p.spot_id as string);
      if (dest && typeof p.url === "string") photosByDest.set(dest, [...(photosByDest.get(dest) ?? []), p.url]);
    }
    const posts = (postRes?.data ?? []) as { title: string | null; cover_image: string | null }[];

    return cards.map((c) => {
      if (!isSatelliteImage(c.image)) return c;
      const real = pickRealPhoto({
        gallery: galleryByDest.get(c.id),
        spotGalleries: spotGalleriesByDest.get(c.id),
        spotPhotos: photosByDest.get(c.id),
        blogCover: blogCoverFor(c.name, posts),
      });
      return real ? { ...c, image: real } : c;
    });
  } catch {
    return cards;
  }
}
