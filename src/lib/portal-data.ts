import { createAdminClient } from "@/lib/supabase";

/* Server-only data access for the member portal. Always scoped to the
   member's own contactId (the caller verifies the session first). */

export type MemberBooking = {
  id: string;
  status: string | null;
  experience_id: string | null;
  agreed_price: number | null;
  downpayment_received: boolean | null;
  final_payment_received: boolean | null;
  created_at: string | null;
  experience: { title: string; slug: string; currency: string | null; cancellation_policy: string | null } | null;
  edition: {
    id: string; label: string | null; date_start: string | null; date_end: string | null; deposit: number | null;
    whatsapp_group_link: string | null; memories_video_url: string | null;
  } | null;
  pkg: { name: string; price: number | null } | null;
};

const SELECT =
  "id,status,experience_id,agreed_price,downpayment_received,final_payment_received,created_at," +
  "exp_experiences(title,slug,currency,cancellation_policy)," +
  "exp_editions(id,label,date_start,date_end,deposit,whatsapp_group_link,memories_video_url)," +
  "exp_packages(name,price)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(b: any): MemberBooking {
  return {
    id: b.id, status: b.status, experience_id: b.experience_id, agreed_price: b.agreed_price,
    downpayment_received: b.downpayment_received, final_payment_received: b.final_payment_received,
    created_at: b.created_at,
    experience: b.exp_experiences ?? null,
    edition: b.exp_editions ?? null,
    pkg: b.exp_packages ?? null,
  };
}

export async function getMemberBookings(contactId: string): Promise<MemberBooking[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_bookings").select(SELECT).eq("contact_id", contactId).order("created_at", { ascending: false });
  return (data ?? []).map(shape);
}

export async function getMemberBooking(contactId: string, bookingId: string): Promise<MemberBooking | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_bookings").select(SELECT).eq("contact_id", contactId).eq("id", bookingId).maybeSingle();
  return data ? shape(data) : null;
}

/** Images for the member-home banner slideshow: the member's own trip photos
    across all bookings; if they have none yet, the hero images of the experiences
    they've booked. De-duped and capped. */
export async function getMemberBannerImages(contactId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const bookings = await getMemberBookings(contactId);
  const lists = await Promise.all(
    bookings.map((b) => (b.edition?.id ? getMemoryPhotosForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([])))
  );
  let imgs = lists.flat().filter(Boolean);

  if (imgs.length === 0) {
    const expIds = [...new Set(bookings.map((b) => b.experience_id).filter(Boolean))] as string[];
    if (expIds.length) {
      const [{ data: content }, { data: exps }] = await Promise.all([
        db.from("exp_content").select("experience_id,hero_image").in("experience_id", expIds),
        db.from("exp_experiences").select("id,hero_image").in("id", expIds),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byContent = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byExp = new Map((exps ?? []).map((e: any) => [e.id, e.hero_image]));
      imgs = expIds.map((id) => byContent.get(id) || byExp.get(id)).filter(Boolean) as string[];
    }
  }
  return [...new Set(imgs)].slice(0, 15);
}

export type MemberProfile = {
  name: string; email: string | null; phone: string | null; country: string | null;
  tshirt_size: string | null; diet_allergies: string | null; date_of_birth: string | null;
  level: string | null; marketing_opt_in: boolean | null;
};

export async function getMemberProfile(contactId: string): Promise<MemberProfile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("contacts")
    .select("name,email,phone,country,tshirt_size,diet_allergies,date_of_birth,level,marketing_opt_in")
    .eq("id", contactId).maybeSingle();
  return data ?? null;
}

/** The experience's gallery images (exp_content.gallery, falling back to the
    experience's own gallery) — offered to members as photos for their review. */
export async function getTripGallery(experienceId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: content } = await db.from("exp_content").select("gallery").eq("experience_id", experienceId).maybeSingle();
  if (content?.gallery?.length) return (content.gallery as string[]).filter(Boolean);
  const { data: exp } = await db.from("exp_experiences").select("gallery").eq("id", experienceId).maybeSingle();
  return ((exp?.gallery as string[] | null) ?? []).filter(Boolean);
}

/** List image files in one storage folder under the `assets` bucket → public URLs.
    Folder entries (sub-directories) have no `id`, so they're naturally excluded. */
async function listAssetFolder(folder: string): Promise<string[]> {
  const admin = createAdminClient();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets`;
  const { data } = await admin.storage.from("assets").list(folder, { limit: 200 });
  return (data ?? [])
    .filter((f) => f.id && f.name !== ".emptyFolderPlaceholder")
    .map((f) => `${base}/${folder}/${f.name}`);
}

/** Whole-week "everyone" photos, from storage assets/memories/{editionId}/.
    Per-participant photos live in the p/{bookingId}/ subfolder and are excluded here. */
export async function getMemoryPhotos(editionId: string): Promise<string[]> {
  return listAssetFolder(`memories/${editionId}`);
}

/** A participant's gallery = their personal photos (assets/memories/{editionId}/p/{bookingId}/)
    plus the week's shared "everyone" photos. Each client only ever sees their own + shared. */
export async function getMemoryPhotosForBooking(editionId: string, bookingId: string): Promise<string[]> {
  const [mine, everyone] = await Promise.all([
    listAssetFolder(`memories/${editionId}/p/${bookingId}`),
    listAssetFolder(`memories/${editionId}`),
  ]);
  return [...mine, ...everyone];
}

/** Sum of incoming (customer→us) payments logged for a booking, from exp_payments.
    Lets the member see what's actually been received (deposit + any bank transfer). */
export async function getBookingPaid(bookingId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_payments").select("amount,direction").eq("booking_id", bookingId);
  return (data ?? [])
    .filter((p: { direction: string | null }) => p.direction !== "out")
    .reduce((s: number, p: { amount: number | null }) => s + (Number(p.amount) || 0), 0);
}

/** Members can download the full photo package a limited number of times. */
export const MEMORY_DOWNLOAD_LIMIT = 3;

/** Downloads still allowed for this booking (tolerant: pre-migration the column is
    absent → treat as none used). */
export async function getMemoryDownloadsRemaining(bookingId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_bookings").select("memory_download_count").eq("id", bookingId).maybeSingle();
  const used = data?.memory_download_count ?? 0;
  return Math.max(0, MEMORY_DOWNLOAD_LIMIT - used);
}

export type HotelInfo = { name: string; image_url: string | null; images: string[] | null; description: string | null; website: string | null };

/** Resolve the hotel for a booking (by the package's hotel_id, else name match on the
    package title) and return its media. Tolerant of migration 023 being unapplied → null. */
export async function getBookingHotel(bookingId: string): Promise<HotelInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: bk } = await db.from("exp_bookings").select("package_id, exp_packages(name)").eq("id", bookingId).maybeSingle();
  if (!bk) return null;
  const pkgName: string = bk.exp_packages?.name ?? "";
  let hotelId: string | null = null;
  if (bk.package_id) {
    const { data: p } = await db.from("exp_packages").select("hotel_id").eq("id", bk.package_id).maybeSingle();
    hotelId = p?.hotel_id ?? null; // null if column missing pre-migration
  }
  const { data: hotels } = await db.from("hotels").select("id,name,image_url,images,description,website");
  if (!Array.isArray(hotels)) return null; // media columns missing pre-migration → no stay module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hotel = hotelId ? hotels.find((h: any) => h.id === hotelId) : null;
  if (!hotel && pkgName) {
    const hay = pkgName.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hotel = hotels.find((h: any) => h.name && hay.includes(h.name.toLowerCase())) ?? null;
  }
  if (!hotel || (!hotel.image_url && !hotel.description)) return null;
  return { name: hotel.name, image_url: hotel.image_url ?? null, images: hotel.images ?? null, description: hotel.description ?? null, website: hotel.website ?? null };
}

export type CoachCard = { name: string; role: string; bio: string; image: string | null };

/** A week's coaches (exp_edition_coaches + exp_coaches, with per-edition overrides),
    mirroring the public experience page. */
export async function getEditionCoaches(editionId: string): Promise<CoachCard[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("exp_edition_coaches")
    .select("sort_order,name_override,role_override,bio_override,image_override,exp_coaches(name,role,bio,image_url)")
    .eq("edition_id", editionId)
    .order("sort_order");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? [])
    .map((g: any) => ({
      name: g.name_override ?? g.exp_coaches?.name ?? "",
      role: g.role_override ?? g.exp_coaches?.role ?? "",
      bio: g.bio_override ?? g.exp_coaches?.bio ?? "",
      image: g.image_override ?? g.exp_coaches?.image_url ?? null,
    }))
    .filter((c: CoachCard) => c.name);
}
