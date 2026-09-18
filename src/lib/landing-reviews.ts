import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { firstNameInitial, publicProfileFor } from "@/lib/member-profile";

/**
 * The crew wall on the Experience home: real, approved guest reviews.
 *
 * WHICH reviews: verified guests only (the review is tied to a booking). Of
 * those, the admin's pick (Homepage → landing → Reviews, stored as `reviewIds`
 * on site_settings `experience_landing_hero`), in that order. With no pick,
 * every approved verified review, the ones with a face first.
 *
 * WHOSE FACE: a reviewer's profile photo shows only when THEY opted their
 * profile into the "reviews" surface (profile settings, off by default), the
 * same gate the trip pages use via publicProfileFor. Nobody else's photo is
 * added here: on 18 Sep 2026 not one guest had given the separate marketing
 * permission (migration 232) that a face in marketing would need.
 */

export type LandingReview = {
  id: string;
  quote: string;
  name: string;
  country: string;
  rating: number;
  verified: boolean;
  /** The card photo the admin attached to this review. */
  image: string | null;
  /** The reviewer's own profile photo, only with their opt-in. */
  avatarUrl: string | null;
  reply: string | null;
};

export type LandingReviews = {
  items: LandingReview[];
  /** Every approved VERIFIED review, not just the ones on the wall. */
  count: number;
  avg: number | null;
};

type Row = {
  id: string; author_name: string | null; author_country: string | null; rating: number | null;
  quote: string | null; photo_url: string | null; booking_id: string | null; reply: string | null;
  created_at: string;
};

export async function getLandingReviews(pick: string[] = []): Promise<LandingReviews> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("exp_reviews")
      .select("id, author_name, author_country, rating, quote, photo_url, booking_id, reply, created_at")
      .eq("status", "approved");
    // Verified guests only (Nico, 18 Sep 2026): a review tied to a real
    // booking. Hand-entered ones stay on the trip pages but not on this wall,
    // and the score counts only what the wall shows.
    const rows = ((data ?? []) as Row[]).filter((r) => (r.quote ?? "").trim() && r.booking_id);
    if (!rows.length) return { items: [], count: 0, avg: null };

    // Profile photos, behind the reviewer's own opt-in.
    const avatarByBooking = new Map<string, string>();
    const bids = rows.map((r) => r.booking_id).filter(Boolean) as string[];
    if (bids.length) {
      const { data: bs } = await db.from("exp_bookings").select("id, contact_id").in("id", bids);
      const cids = [...new Set(((bs ?? []) as { contact_id: string | null }[]).map((b) => b.contact_id).filter(Boolean))];
      if (cids.length) {
        const { data: cs } = await db
          .from("contacts")
          .select("id,name,username,avatar_url,country,display_city,self_level,level,level_status,date_of_birth,profile_visibility")
          .in("id", cids);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prof = new Map(((cs ?? []) as any[]).map((c) => [c.id, publicProfileFor(c, "reviews")]));
        for (const b of (bs ?? []) as { id: string; contact_id: string | null }[]) {
          const url = b.contact_id ? prof.get(b.contact_id)?.avatarUrl : null;
          if (url) avatarByBooking.set(b.id, url);
        }
      }
    }

    // No place or year on the wall (Nico, 18 Sep 2026), so none is loaded.
    const toItem = (r: Row): LandingReview => {
      return {
        id: r.id,
        quote: (r.quote ?? "").trim(),
        name: firstNameInitial(r.author_name),
        country: (r.author_country ?? "").trim(),
        rating: Math.max(1, Math.min(5, r.rating || 5)),
        verified: !!r.booking_id,
        image: r.photo_url || null,
        avatarUrl: r.booking_id ? avatarByBooking.get(r.booking_id) ?? null : null,
        reply: (r.reply ?? "").trim() || null,
      };
    };

    const all = rows.map(toItem);
    const byId = new Map(all.map((x) => [x.id, x]));
    const picked = pick.map((id) => byId.get(id)).filter(Boolean) as LandingReview[];
    // No pick: faces first, then verified, then newest. A wall of anonymous
    // cards is exactly what this section is not.
    const created = new Map(rows.map((r) => [r.id, r.created_at]));
    const auto = [...all].sort((a, b) =>
      (Number(!!b.avatarUrl) * 2 + Number(b.verified)) - (Number(!!a.avatarUrl) * 2 + Number(a.verified)) ||
      (created.get(b.id) ?? "").localeCompare(created.get(a.id) ?? ""));

    const count = all.length;
    const avg = Math.round((all.reduce((s, x) => s + x.rating, 0) / count) * 10) / 10;
    return { items: picked.length ? picked : auto, count, avg };
  } catch {
    return { items: [], count: 0, avg: null };
  }
}
