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

/** Photos for a week's memories, from storage assets/memories/{editionId}/. */
export async function getMemoryPhotos(editionId: string): Promise<string[]> {
  const admin = createAdminClient();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets`;
  const { data } = await admin.storage.from("assets").list(`memories/${editionId}`, { limit: 200 });
  return (data ?? [])
    .filter((f) => f.id && f.name !== ".emptyFolderPlaceholder")
    .map((f) => `${base}/memories/${editionId}/${f.name}`);
}
