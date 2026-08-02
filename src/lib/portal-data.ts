import { createAdminClient } from "@/lib/supabase";
import { isAttending, normalizeBookingStatus, isLostStatus } from "@/lib/types";
import { effectiveAddonStatus } from "@/lib/addons";
import { parseFlightNote, type FlightInfo } from "@/lib/flights";
import {
  EMPTY_VISIBILITY, ageFrom, MINOR_AGE, parseVisibility, publicProfileFor,
  type ContactProfileRow, type ProfileSurface, type PublicProfile, type Visibility,
} from "@/lib/member-profile";
import { deriveSuggestedLevel, type SkillTag } from "@/lib/member-level";
import { buildProgression, type CatalogSkill, type Achievement, type Progression } from "@/lib/progression";
import { sumReceived } from "@/lib/payment-totals";

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
  experience: { title: string; slug: string; currency: string | null; cancellation_policy: string | null; hero_image: string | null; location?: string | null; tileAuto?: boolean; coachName?: string | null; coachCutout?: string | null } | null;
  edition: {
    id: string; label: string | null; date_start: string | null; date_end: string | null; deposit: number | null;
    whatsapp_group_link: string | null; memories_video_url: string | null; hero_image: string | null;
  } | null;
  pkg: { name: string; price: number | null } | null;
  wa_group: boolean | null;
  flight_info: Record<string, unknown> | null;
};

const SELECT =
  "id,status,experience_id,agreed_price,downpayment_received,final_payment_received,created_at,wa_group,flight_info," +
  "exp_experiences(title,slug,currency,cancellation_policy,hero_image,location)," +
  "exp_editions(id,label,date_start,date_end,deposit,whatsapp_group_link,memories_video_url,hero_image)," +
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
    wa_group: b.wa_group ?? null,
    flight_info: b.flight_info ?? null,
  };
}

/** The experience's pre-trip content (written once in admin → Event Content →
    Pre-trip): the packing list and Nico's personal note. Same source the
    pre-trip emails use, so the trip account shows exactly what the emails
    promise is "in your account". */
export async function getPreTripContent(experienceId: string): Promise<{ packingList: string | null; preTripNote: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_content").select("packing_list,pre_trip_note").eq("experience_id", experienceId).maybeSingle();
  return { packingList: data?.packing_list ?? null, preTripNote: data?.pre_trip_note ?? null };
}

/** Attach the auto-branded-tile data (tile_auto + default/head coach) to each
    booking's experience, so the member trip tiles render the SAME <BrandedTile>
    as the homepage experience tiles. Tolerant: pre-069 (no tile_auto / coaches) →
    tileAuto stays false and the tile falls back to a plain hero. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichBrandedTiles(db: any, bookings: MemberBooking[]): Promise<void> {
  const expIds = [...new Set(bookings.map((b) => b.experience_id).filter(Boolean))] as string[];
  if (!expIds.length) return;
  try {
    const [autoRes, coachRes] = await Promise.all([
      db.from("exp_experiences").select("id,tile_auto").in("id", expIds),
      db.from("exp_coaches").select("name,cutout_url,role"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autoIds = new Set(((autoRes.data ?? []) as any[]).filter((e) => e.tile_auto === true).map((e) => e.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coaches = (coachRes.data ?? []) as any[];
    // Default coach = the library's head coach (Nico), else the first — matches the
    // homepage's fallback when an edition names no coach.
    const head = coaches.find((c) => /head/i.test(String(c.role ?? ""))) ?? coaches[0];
    const coachName = head?.name ?? null;
    const coachCutout = head?.cutout_url ?? null;
    for (const b of bookings) {
      if (b.experience && b.experience_id) {
        b.experience.tileAuto = autoIds.has(b.experience_id);
        b.experience.coachName = coachName;
        b.experience.coachCutout = coachCutout;
      }
    }
  } catch { /* tolerant — no tile data → plain hero fallback */ }
}

export async function getMemberBookings(contactId: string): Promise<MemberBooking[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_bookings").select(SELECT).eq("contact_id", contactId).order("created_at", { ascending: false });
  const bookings = (data ?? []).map(shape);
  await enrichBrandedTiles(db, bookings);
  return bookings;
}

export async function getMemberBooking(contactId: string, bookingId: string): Promise<MemberBooking | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_bookings").select(SELECT).eq("contact_id", contactId).eq("id", bookingId).maybeSingle();
  return data ? shape(data) : null;
}

/** Images for the member-home banner slideshow: the member's own trip photos
    across all bookings; if they have none, the hero images of the experiences
    they've booked; and if they've booked nothing at all, the hero images of the
    NEXT upcoming trips (general inspiration, not theirs). De-duped and capped. */
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

  if (imgs.length === 0) {
    imgs = await getUpcomingTripImages(db);
  }

  return [...new Set(imgs)].slice(0, 15);
}

/** Hero images of the next published, future editions (soonest first) — the
    general "next trips coming up" used to dress an empty member home. Prefers the
    edition's own hero (migration 047), then the experience hero. Tolerant of
    pre-migration columns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUpcomingTripImages(db: any): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  // hero_image on editions arrives with migration 047 — fall back if absent.
  let edRes = await db.from("exp_editions").select("experience_id,hero_image,date_start,status").eq("status", "published").gte("date_start", today).order("date_start", { ascending: true }).limit(8);
  if (edRes.error) edRes = await db.from("exp_editions").select("experience_id,date_start,status").eq("status", "published").gte("date_start", today).order("date_start", { ascending: true }).limit(8);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eds = (edRes.data ?? []) as any[];
  const expIds = [...new Set(eds.map((e) => e.experience_id).filter(Boolean))] as string[];
  if (!expIds.length) return [];
  const [{ data: content }, { data: exps }] = await Promise.all([
    db.from("exp_content").select("experience_id,hero_image").in("experience_id", expIds),
    db.from("exp_experiences").select("id,hero_image,status").in("id", expIds),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byContent = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExp = new Map((exps ?? []).map((e: any) => [e.id, e.hero_image]));
  // Only surface editions whose experience is itself published.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publishedExp = new Set((exps ?? []).filter((e: any) => e.status === "published").map((e: any) => e.id));
  return eds
    .filter((e) => publishedExp.has(e.experience_id))
    .map((e) => e.hero_image || byContent.get(e.experience_id) || byExp.get(e.experience_id))
    .filter(Boolean) as string[];
}

export type MemberProfile = {
  name: string; email: string | null; phone: string | null; country: string | null;
  tshirt_size: string | null; diet_allergies: string | null; date_of_birth: string | null;
  level: string | null; marketing_opt_in: boolean | null;
  // community-profile fields (migration 035) — null/empty until applied
  username: string | null; avatar_url: string | null; display_city: string | null;
  visibility: Visibility;
  // level system (migration 036) — null/false until applied
  self_level: string | null; level_status: string | null; coach_can_manage_level: boolean;
};

export async function getMemberProfile(contactId: string): Promise<MemberProfile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("contacts")
    .select("name,email,phone,country,tshirt_size,diet_allergies,date_of_birth,level,marketing_opt_in")
    .eq("id", contactId).maybeSingle();
  if (!data) return null;
  // 035 and 036 columns live in SEPARATE tolerant reads so applying one without
  // the other never blanks the features of the other (unknown column → error → defaults).
  let username: string | null = null, avatar_url: string | null = null, display_city: string | null = null;
  let visibility: Visibility = EMPTY_VISIBILITY;
  const c035 = await db.from("contacts")
    .select("username,avatar_url,display_city,profile_visibility").eq("id", contactId).maybeSingle();
  if (c035.data) {
    username = c035.data.username ?? null;
    avatar_url = c035.data.avatar_url ?? null;
    display_city = c035.data.display_city ?? null;
    visibility = parseVisibility(c035.data.profile_visibility);
  }
  let self_level: string | null = null, level_status: string | null = null, coach_can_manage_level = false;
  const c036 = await db.from("contacts")
    .select("self_level,level_status,coach_can_manage_level").eq("id", contactId).maybeSingle();
  if (c036.data) {
    self_level = c036.data.self_level ?? null;
    level_status = c036.data.level_status ?? null;
    coach_can_manage_level = !!c036.data.coach_can_manage_level;
  }
  return { ...data, username, avatar_url, display_city, visibility, self_level, level_status, coach_can_manage_level };
}

/** The member's own trip photos (their personal + the week's shared photos),
    de-duped across all bookings — used as the avatar picker source. */
export async function getProfilePhotoChoices(contactId: string): Promise<string[]> {
  const bookings = await getMemberBookings(contactId);
  const lists = await Promise.all(
    bookings.map((b) => (b.edition?.id ? getMemoryPhotosForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([])))
  );
  return [...new Set(lists.flat().filter(Boolean))].slice(0, 60);
}

export type CrewRoster = { going: number; sharing: number; profiles: PublicProfile[] };

/**
 * The opted-in crew for an edition, projected to public fields. This is the ONLY
 * path by which one member sees another on a trip — it runs as service role and
 * returns only what each owner chose to share (`surfaces.crew`). Minors (known
 * DOB under 18) are excluded entirely. `going` counts active participants; the
 * caller must already have verified the viewer is one of them.
 */
export async function getCrewProfiles(editionId: string, viewerContactId: string): Promise<CrewRoster> {
  const empty: CrewRoster = { going: 0, sharing: 0, profiles: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: bookings } = await db.from("exp_bookings")
    .select("contact_id,status,downpayment_received,deposit_received,created_at")
    .eq("edition_id", editionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // A cancelled booking keeps its payment flags — they are history, and the
  // refund hangs off them — so without the status check a cancelled guest still
  // passes the "actually coming" test below and appears in the crew.
  const onEdition = (bookings ?? []).filter((b: any) => b.contact_id && !isLostStatus(b.status));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!onEdition.some((b: any) => b.contact_id === viewerContactId)) return empty; // viewer isn't on this edition

  // Crew = people actually coming: downpayment (or deposit) paid, OR just signed up
  // (reserved) and still within the 14-day window to pay it. Past that window unpaid
  // — or leads / cancelled — they drop off the roster until they pay.
  const GRACE_DAYS = 14;
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coming = onEdition.filter((b: any) => {
    if (b.downpayment_received === true || b.deposit_received === true || isAttending(b.status)) return true;
    if (normalizeBookingStatus(b.status) === "reserved" && b.created_at) {
      return (now - new Date(b.created_at).getTime()) / 86400000 <= GRACE_DAYS;
    }
    return false;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactIds = [...new Set(coming.map((b: any) => b.contact_id))] as string[];
  const going = contactIds.length;
  if (going === 0) return empty;

  // Tolerant read of the profile columns — absent before migration 035 → no one shares.
  const sel = "id,name,username,avatar_url,country,display_city,level,date_of_birth,profile_visibility";
  const { data: rows, error } = await db.from("contacts").select(sel).in("id", contactIds);
  if (error || !rows) return { going, sharing: 0, profiles: [] };

  // The 036 level fields ride along in a SEPARATE tolerant read so the crew still
  // works on a 035-only DB (the projection falls back to the legacy `level`).
  const lvl036 = await db.from("contacts").select("id,self_level,level_status").in("id", contactIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lvlBy = new Map((lvl036.data ?? []).map((r: any) => [r.id, r]));

  const profiles: PublicProfile[] = [];
  for (const base of rows as ContactProfileRow[]) {
    const row = { ...base, ...(lvlBy.get(base.id) ?? {}) } as ContactProfileRow;
    const age = ageFrom(row.date_of_birth);
    if (age != null && age < MINOR_AGE) continue; // never list a minor
    const p = publicProfileFor(row, "crew");
    if (p) profiles.push(p);
  }

  // Hover skills: attach each verified member's achieved skill labels (shown only
  // because they already share their level). Tolerant of 039 (no catalog → none).
  const verifiedIds = profiles.filter((p) => p.levelVerified).map((p) => p.contactId);
  if (verifiedIds.length) {
    const catalog = await readActiveCatalog(db);
    if (catalog.length) {
      const ms = await db.from("contact_milestones").select("contact_id,milestone_id").in("contact_id", verifiedIds);
      const achievedByContact = new Map<string, Set<string>>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (ms.data ?? []) as any[]) {
        const set = achievedByContact.get(r.contact_id) ?? new Set<string>();
        set.add(r.milestone_id);
        achievedByContact.set(r.contact_id, set);
      }
      // Walk the catalog in canonical (tier → sort_order) order so skills come out
      // grouped Beginner→Pro rather than in random row order.
      for (const p of profiles) {
        const ach = achievedByContact.get(p.contactId);
        p.skills = ach ? catalog.filter((m) => ach.has(m.id)).map((m) => ({ label: m.label, tier: m.tier })) : [];
      }
    }
  }

  profiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { going, sharing: profiles.length, profiles };
}

export type AuthorBadge = { displayName: string; avatarUrl: string | null; username: string | null; initials: string; level: string | null; levelVerified: boolean; skills: SkillTag[] };

/**
 * Public author badges for a set of contacts, for a given community surface
 * (reviews / spot_notes). Returns an entry ONLY for contacts who opted into that
 * surface — others fall back to the frozen author_name at the render site. Runs
 * as service role; tolerant of the unapplied migration (no columns → empty map).
 */
export async function getCommunityAuthors(contactIds: (string | null | undefined)[], surface: ProfileSurface): Promise<Record<string, AuthorBadge>> {
  const ids = [...new Set(contactIds.filter(Boolean))] as string[];
  if (!ids.length) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const sel = "id,name,username,avatar_url,country,display_city,level,date_of_birth,profile_visibility";
  const { data: rows, error } = await db.from("contacts").select(sel).in("id", ids);
  if (error || !rows) return {};
  // 036 level fields ride along in a tolerant read (verified level → ✓ on the byline)
  const lvl036 = await db.from("contacts").select("id,self_level,level_status").in("id", ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lvlBy = new Map((lvl036.data ?? []).map((r: any) => [r.id, r]));

  const out: Record<string, AuthorBadge> = {};
  for (const base of rows as ContactProfileRow[]) {
    const row = { ...base, ...(lvlBy.get(base.id) ?? {}) } as ContactProfileRow;
    const p = publicProfileFor(row, surface);
    if (p) out[row.id] = { displayName: p.displayName, avatarUrl: p.avatarUrl, username: p.username, initials: p.initials, level: p.level, levelVerified: p.levelVerified, skills: [] };
  }

  // skills on hover — only verified members who show their level (same gate as the crew)
  const verifiedIds = Object.keys(out).filter((id) => out[id].levelVerified);
  if (verifiedIds.length) {
    const catalog = await readActiveCatalog(db);
    if (catalog.length) {
      const ms = await db.from("contact_milestones").select("contact_id,milestone_id").in("contact_id", verifiedIds);
      const achievedByContact = new Map<string, Set<string>>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (ms.data ?? []) as any[]) {
        const set = achievedByContact.get(r.contact_id) ?? new Set<string>();
        set.add(r.milestone_id);
        achievedByContact.set(r.contact_id, set);
      }
      // Canonical (tier → sort_order) order so the byline tooltip groups cleanly.
      for (const id of verifiedIds) {
        const ach = achievedByContact.get(id);
        if (ach && out[id]) out[id].skills = catalog.filter((m) => ach.has(m.id)).map((m) => ({ label: m.label, tier: m.tier }));
      }
    }
  }
  return out;
}

export type LevelMilestone = { id: string; key: string; label: string; description: string | null; tier: string; sort_order: number; achieved: boolean; via?: string | null };
export type LevelHistoryEntry = { level: string | null; status: string | null; source: string | null; note: string | null; created_at: string };
export type MemberLevelDetail = {
  self_level: string | null; coach_level: string | null; level_status: string | null;
  coach_can_manage_level: boolean; suggested: string | null;
  milestones: LevelMilestone[]; history: LevelHistoryEntry[];
  /** True once they've been on a trip — after that the level is coach-set only. */
  hasAttended: boolean;
};

/** Active milestone catalog (short `label` + full `description`). Tolerant:
    reads `description` (migration 039) and falls back when it's absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readActiveCatalog(db: any): Promise<CatalogMilestone[]> {
  let r = await db.from("level_milestones").select("id,key,label,description,tier,sort_order").eq("active", true).order("sort_order");
  if (r.error) r = await db.from("level_milestones").select("id,key,label,tier,sort_order").eq("active", true).order("sort_order");
  if (r.error || !r.data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (r.data as any[]).map((m) => ({ id: m.id, key: m.key, label: m.label, description: m.description ?? null, tier: m.tier, sort_order: m.sort_order }));
}

/**
 * Everything the level UIs (member "Your level" + admin "Level & skills") need:
 * the member's level fields, the milestone catalog with achieved flags, the
 * derived suggestion, and the history. Service-role; tolerant of migration 036
 * being unapplied (missing columns/tables → empty/defaults, never throws).
 */
export async function getMemberLevelDetail(contactId: string): Promise<MemberLevelDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const base = await db.from("contacts").select("level").eq("id", contactId).maybeSingle();
  const coach_level: string | null = base.data?.level ?? null;

  let self_level: string | null = null, level_status: string | null = null, coach_can_manage_level = false;
  const c036 = await db.from("contacts").select("self_level,level_status,coach_can_manage_level").eq("id", contactId).maybeSingle();
  if (c036.data) {
    self_level = c036.data.self_level ?? null;
    level_status = c036.data.level_status ?? null;
    coach_can_manage_level = !!c036.data.coach_can_manage_level;
  }

  const catalog = await readActiveCatalog(db);
  let milestones: LevelMilestone[] = [];
  if (catalog.length) {
    // Carry the verification source (self / coach / windcoach) so the coach panel
    // can flag self-logged skills awaiting confirmation. Tolerant of a pre-068 DB.
    let ach = await db.from("contact_milestones").select("milestone_id,verified_via").eq("contact_id", contactId);
    if (ach.error) ach = await db.from("contact_milestones").select("milestone_id").eq("contact_id", contactId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viaById = new Map<string, string | null>((ach.data ?? []).map((r: any) => [r.milestone_id, r.verified_via ?? null]));
    milestones = catalog.map((m) => ({ ...m, achieved: viaById.has(m.id), via: viaById.get(m.id) ?? null }));
  }

  let history: LevelHistoryEntry[] = [];
  const h = await db.from("contact_level_history").select("level,status,source,note,created_at")
    .eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20);
  if (!h.error && h.data) history = h.data as LevelHistoryEntry[];

  const suggested = deriveSuggestedLevel(
    milestones.map((m) => ({ id: m.id, key: m.key, label: m.label, tier: m.tier, sort_order: m.sort_order })),
    new Set(milestones.filter((m) => m.achieved).map((m) => m.id))
  );

  // Has the rider been on a trip yet? "attended" status, or a committed booking
  // whose trip has ended. After the first, self-rating is off (coach-set only).
  const today = new Date().toISOString().slice(0, 10);
  const bk = await db.from("exp_bookings").select("status, exp_editions(date_end)").eq("contact_id", contactId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAttended = ((bk.data ?? []) as any[]).some((b) => {
    const st = String(b.status || "").toLowerCase();
    if (st.includes("attend")) return true;
    const end = b.exp_editions?.date_end as string | null;
    return !!end && end < today && !/lost|cancel|lead/.test(st);
  });

  return { self_level, coach_level, level_status, coach_can_manage_level, suggested, milestones, history, hasAttended };
}

/** Discipline-track progression (Freeride/Freerace/Slalom + side skills) with the
    difficulty grade and three-tier verification. Tolerant of a pre-068 DB: reads
    the whole rows and defaults difficulty/verified_via/discipline in code. */
export async function getMemberProgression(contactId: string): Promise<Progression | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const cat = await db.from("level_milestones").select("*").eq("active", true);
  if (cat.error || !cat.data?.length) return null;
  const catalog: CatalogSkill[] = (cat.data as Record<string, unknown>[]).map((m) => ({
    id: String(m.id), key: String(m.key), label: String(m.label ?? ""), tier: String(m.tier ?? ""),
    rank: (m.rank as string | null) ?? null,
    discipline: m.discipline as CatalogSkill["discipline"],
    difficulty: typeof m.difficulty === "number" ? m.difficulty : 10,
    prerequisite_key: (m.prerequisite_key as string | null) ?? null,
    sort_order: typeof m.sort_order === "number" ? m.sort_order : 0,
  }));
  const ach = await db.from("contact_milestones").select("*").eq("contact_id", contactId);
  const achievements: Achievement[] = (ach.data ?? []).map((r: Record<string, unknown>) => ({
    milestone_id: String(r.milestone_id),
    verified_via: ((r.verified_via as Achievement["verified_via"]) ?? "coach"),
  }));
  return buildProgression(catalog, achievements);
}

export type CatalogMilestone = { id: string; key: string; label: string; description: string | null; tier: string; sort_order: number };
export type EditionCrewMember = {
  contactId: string; name: string; self_level: string | null; coach_level: string | null;
  level_status: string | null; suggested: string | null; reviewed: boolean; achievedIds: string[];
  /** Achieved skills the rider self-logged that a coach hasn't confirmed yet. */
  selfLoggedIds: string[];
};
export type EditionCrewLevels = {
  catalog: CatalogMilestone[]; members: EditionCrewMember[]; reviewed: number; total: number;
};

/**
 * The whole cohort of an edition with their level state + milestone ticks — the
 * data behind the admin per-trip batch review. Service-role; tolerant of
 * migration 036 (level fields/catalog absent → sensible defaults). "reviewed"
 * means the level is verified. Caller must be a team member.
 */
export async function getEditionCrewLevels(editionId: string): Promise<EditionCrewLevels> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: bookings } = await db.from("exp_bookings").select("contact_id,status").eq("edition_id", editionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactIds = [...new Set((bookings ?? []).filter((b: any) => !/cancel|lost/i.test(b.status ?? "") && b.contact_id).map((b: any) => b.contact_id))] as string[];
  if (contactIds.length === 0) return { catalog: [], members: [], reviewed: 0, total: 0 };

  const { data: base } = await db.from("contacts").select("id,name,level").in("id", contactIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseBy = new Map((base ?? []).map((c: any) => [c.id, c]));
  const lvl = await db.from("contacts").select("id,self_level,level_status").in("id", contactIds); // 036 tolerant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lvlBy = new Map((lvl.data ?? []).map((c: any) => [c.id, c]));

  const catalog = await readActiveCatalog(db);

  // Read the verification source too (068+) so the UI can flag skills the rider
  // self-logged and awaiting a coach's confirm. Tolerant of a pre-068 DB.
  let ach = await db.from("contact_milestones").select("contact_id,milestone_id,verified_via").in("contact_id", contactIds);
  if (ach.error) ach = await db.from("contact_milestones").select("contact_id,milestone_id").in("contact_id", contactIds);
  const achBy = new Map<string, string[]>();
  const selfBy = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (ach.data ?? []) as any[]) {
    achBy.set(r.contact_id, [...(achBy.get(r.contact_id) ?? []), r.milestone_id]);
    if (r.verified_via === "self") selfBy.set(r.contact_id, [...(selfBy.get(r.contact_id) ?? []), r.milestone_id]);
  }

  const members: EditionCrewMember[] = contactIds.map((cid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = baseBy.get(cid) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l: any = lvlBy.get(cid) ?? {};
    const achievedIds = achBy.get(cid) ?? [];
    const suggested = deriveSuggestedLevel(catalog, new Set(achievedIds));
    return {
      contactId: cid, name: b.name ?? "—", self_level: l.self_level ?? null, coach_level: b.level ?? null,
      level_status: l.level_status ?? null, suggested, reviewed: l.level_status === "verified", achievedIds,
      selfLoggedIds: selfBy.get(cid) ?? [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return { catalog, members, reviewed: members.filter((m) => m.reviewed).length, total: members.length };
}

/**
 * Recompute a member's level from their ticked milestones and, if a tier just
 * completed (or un-completed) into a different level, set it as coach-verified
 * and log it. The milestone-basis auto-set: ticking skills moves the level.
 * Returns the derived level (or null). Tolerant of migration 036/039 unapplied.
 */
export async function recomputeDerivedLevel(contactId: string, byTeamMemberId: string | null): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const catalog = await readActiveCatalog(db);
  if (!catalog.length) return null;
  const ach = await db.from("contact_milestones").select("milestone_id").eq("contact_id", contactId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const achieved = new Set<string>((ach.data ?? []).map((r: any) => r.milestone_id as string));
  const derived = deriveSuggestedLevel(catalog, achieved);
  if (!derived) return null; // no full tier yet → leave the level as-is
  const { data: c } = await db.from("contacts").select("level,level_status").eq("id", contactId).maybeSingle();
  if (c?.level === derived && c?.level_status === "verified") return derived; // already there
  const now = new Date().toISOString();
  const { error } = await db.from("contacts").update({ level: derived, level_status: "verified", level_verified_at: now, updated_at: now }).eq("id", contactId);
  if (error) return null;
  await db.from("contact_level_history").insert({ contact_id: contactId, level: derived, status: "verified", source: "milestone", created_by: byTeamMemberId });
  return derived;
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
  // Page through so trips with >1000 photos aren't truncated (was capped at 200).
  const names: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await admin.storage.from("assets").list(folder, { limit: PAGE, offset });
    for (const f of data ?? []) if (f.id && f.name !== ".emptyFolderPlaceholder") names.push(f.name);
    if (!data || data.length < PAGE) break;
  }
  // Natural alphabetical by filename (so "…-2" comes before "…-10").
  names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  // Encode the filename — trip photos often have spaces ("NP7 Experience-1.jpg"),
  // which break <img>/CSS url() loading otherwise.
  return names.map((n) => `${base}/${folder}/${encodeURIComponent(n)}`);
}

/** Whole-week "everyone" photos, from storage assets/memories/{editionId}/.
    Per-participant photos live in the p/{bookingId}/ subfolder and are excluded here. */
export async function getMemoryPhotos(editionId: string): Promise<string[]> {
  return listAssetFolder(`memories/${editionId}`);
}

/** ONLY the member's own personal shots (assets/memories/{editionId}/p/{bookingId}/) —
    no week-shared "everyone" photos. Used for the review photo picker so a rider
    attaches a photo that's genuinely theirs. */
export async function getOwnTripPhotos(editionId: string, bookingId: string): Promise<string[]> {
  return listAssetFolder(`memories/${editionId}/p/${bookingId}`);
}

/** A participant's gallery = their personal photos (assets/memories/{editionId}/p/{bookingId}/)
    plus the week's shared "everyone" photos. Each client only ever sees their own + shared.
    Used for the member's OWN-only surfaces (home banner, avatar picker) — never pulls the
    group pool. The trip gallery itself uses getTripGalleryForBooking() below. */
export async function getMemoryPhotosForBooking(editionId: string, bookingId: string): Promise<string[]> {
  const [mine, everyone] = await Promise.all([
    listAssetFolder(`memories/${editionId}/p/${bookingId}`),
    listAssetFolder(`memories/${editionId}`),
  ]);
  return [...mine, ...everyone];
}

/** Is this booking sharing its personal photos with the rest of the trip? Tolerant:
    pre-migration (column absent) → treated as shared (the default). */
export async function getBookingPhotoSharing(bookingId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("exp_bookings").select("photos_shared").eq("id", bookingId).maybeSingle();
  if (error || !data || data.photos_shared == null) return true;
  return data.photos_shared !== false;
}

/** The full trip gallery as seen by ONE participant (viewerBookingId), in display order:
    1) the viewer's OWN personal photos (always on top),
    2) the week's shared "Everyone" photos,
    3) the personal photos of the OTHER participants on the same edition who left sharing ON.
    De-duped (the viewer's own never repeat). Non-sharing participants are never exposed. */
export async function getTripGalleryForBooking(editionId: string, viewerBookingId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Other bookings on this edition that share their photos. Tolerant: if the
  // photos_shared column isn't there yet, fall back to ids-only (default = shared).
  let others: string[] = [];
  let withFlag = await db.from("exp_bookings").select("id, photos_shared").eq("edition_id", editionId);
  if (withFlag.error) withFlag = await db.from("exp_bookings").select("id").eq("edition_id", editionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  others = ((withFlag.data ?? []) as any[])
    .filter((r) => r.id !== viewerBookingId && r.photos_shared !== false)
    .map((r) => r.id as string);

  const [mine, everyone, ...otherLists] = await Promise.all([
    listAssetFolder(`memories/${editionId}/p/${viewerBookingId}`),
    listAssetFolder(`memories/${editionId}`),
    ...others.map((bid) => listAssetFolder(`memories/${editionId}/p/${bid}`)),
  ]);

  // Order = own first, then shared, then everyone else's; de-dupe keeping first.
  return [...new Set([...mine, ...everyone, ...otherLists.flat()])];
}

export type GalleryGroup = { key: string; label: string; kind: "mine" | "everyone" | "participant"; photos: string[] };

/** Strip the " — Place Year" suffix from a booking name → just the person. */
function personName(n: string | null | undefined): string {
  return String(n || "").split(" — ")[0].split(" – ")[0].trim();
}

/** The trip gallery split into foldable groups for ONE viewer, in order:
    1) "Your photos" (the viewer's personal folder),
    2) "Week memories" (the shared Everyone folder),
    3) one group per OTHER participant who shares (labelled with their name).
    Non-sharing participants are never included. */
export async function getTripGalleryGroupsForBooking(editionId: string, viewerBookingId: string): Promise<GalleryGroup[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let rows = await db.from("exp_bookings").select("id, name, photos_shared, contacts(name)").eq("edition_id", editionId);
  if (rows.error) rows = await db.from("exp_bookings").select("id, name").eq("edition_id", editionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const others = ((rows.data ?? []) as any[]).filter((r) => r.id !== viewerBookingId && r.photos_shared !== false);

  const [mine, everyone, ...otherLists] = await Promise.all([
    listAssetFolder(`memories/${editionId}/p/${viewerBookingId}`),
    listAssetFolder(`memories/${editionId}`),
    ...others.map((o) => listAssetFolder(`memories/${editionId}/p/${o.id}`)),
  ]);

  const groups: GalleryGroup[] = [];
  if (mine.length) groups.push({ key: "mine", label: "Your photos", kind: "mine", photos: mine });
  if (everyone.length) groups.push({ key: "everyone", label: "Week memories", kind: "everyone", photos: everyone });
  others.forEach((o, i) => {
    const photos = otherLists[i] ?? [];
    if (!photos.length) return;
    const nm = personName(o.contacts?.name || o.name) || "A fellow rider";
    groups.push({ key: `p:${o.id}`, label: nm, kind: "participant", photos });
  });
  return groups;
}

export type TripVideo = { url: string; poster: string | null; stem: string };

/** Ready (compressed) trip videos a member can watch: their own personal clips
    plus the week's shared ones. Raw uploads still being compressed are excluded
    (they only exist under _vidraw/ until jibe's box finishes). */
export async function getTripVideosForBooking(editionId: string, viewerBookingId: string): Promise<TripVideo[]> {
  const { listUnderPrefix, cdnUrlFor, r2VideoEnabled } = await import("./r2-presign");
  if (!r2VideoEnabled()) return [];
  const prefixes = [`_video/${editionId}/p/${viewerBookingId}/`, `_video/${editionId}/`];
  const seen = new Set<string>();
  const out: TripVideo[] = [];
  for (const pfx of prefixes) {
    const objs = await listUnderPrefix(pfx).catch(() => []);
    // The "Everyone" prefix recurses into /p/… — keep only this member's own subtree there.
    const scoped = pfx.endsWith(`/p/${viewerBookingId}/`)
      ? objs
      : objs.filter((o) => !o.key.includes(`/${editionId}/p/`));
    const posters = new Map(
      scoped.filter((o) => /\.(jpe?g|png|webp)$/i.test(o.key)).map((o) => [o.key.replace(/\.[^.]+$/, ""), o] as const)
    );
    for (const o of scoped) {
      if (!o.key.endsWith(".mp4")) continue;
      const base = o.key.replace(/\.[^.]+$/, "");
      if (seen.has(base)) continue;
      seen.add(base);
      // Version the poster URL by its last-modified time. A regenerated poster
      // keeps the same key, so without this the CDN keeps serving the stale
      // (e.g. black) cached copy until its TTL expires — the ?v busts it.
      const p = posters.get(base);
      let posterUrl: string | null = null;
      if (p) {
        const v = p.lastModified ? Date.parse(p.lastModified) : NaN;
        posterUrl = cdnUrlFor(p.key) + (Number.isFinite(v) ? `?v=${v}` : "");
      }
      // stem = key minus the _video/ root + extension — the ref keepers use.
      out.push({ url: cdnUrlFor(o.key), poster: posterUrl, stem: base.replace(/^_video\//, "") });
    }
  }
  return out;
}

export type TripMemories = { bookingId: string; title: string; dateLabel: string | null; groups: GalleryGroup[]; total: number; videos: TripVideo[] };

/** Every trip the member has photos for, each split into the same groups — for the
    cross-trip "My memories" view on the home area (view-only, no download). */
export async function getAllMemberMemories(contactId: string): Promise<TripMemories[]> {
  const bookings = await getMemberBookings(contactId);
  const out = await Promise.all(
    bookings.map(async (b): Promise<TripMemories | null> => {
      if (!b.edition?.id) return null;
      const [groups, videos] = await Promise.all([
        getTripGalleryGroupsForBooking(b.edition.id, b.id).catch(() => [] as GalleryGroup[]),
        getTripVideosForBooking(b.edition.id, b.id).catch(() => [] as TripVideo[]),
      ]);
      const total = groups.reduce((n, g) => n + g.photos.length, 0);
      if (!total && videos.length === 0) return null;
      const dl = b.edition.date_start
        ? new Date(b.edition.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : null;
      return { bookingId: b.id, title: b.experience?.title ?? "Your trip", dateLabel: dl, groups, total, videos };
    })
  );
  return out.filter((x): x is TripMemories => x != null);
}

/** Sum of incoming (customer→us) payments logged for a booking, from exp_payments.
    Lets the member see what's actually been received (deposit + any bank transfer). */
export async function getBookingPaid(bookingId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_payments").select("amount,direction,type,status").eq("booking_id", bookingId);
  // Only money that actually arrived — see lib/payment-totals. Counting pending
  // and cancelled rows here is what let a booking read as paid on nothing.
  return sumReceived(data ?? []);
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

/** Total of confirmed add-ons on a booking — added to what the member owes.
    Uses the effective status (status column or notes sentinel) so requested/declined
    rows don't count, pre- or post-migration. */
export async function getConfirmedAddonsTotal(bookingId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_booking_addons").select("price,status,notes,payment_mode").eq("booking_id", bookingId);
  return (data ?? [])
    .filter((a: { status?: string | null; notes?: string | null }) => effectiveAddonStatus(a) === "confirmed")
    // 'direct' = we arranged it, the guest pays the provider. It is not our
    // money and must never reach the trip total, an invoice or a balance.
    .filter((a: { payment_mode?: string | null }) => a.payment_mode !== "direct")
    .reduce((s: number, a: { price: number | null }) => s + (Number(a.price) || 0), 0);
}

/** Member-entered flight details for a booking. Reads flight_info (migration 025)
    or the notes sentinel, then merges arrival/departure dates from fly_in/fly_out. */
export async function getBookingFlights(bookingId: string): Promise<FlightInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: base } = await db.from("exp_bookings").select("fly_in, fly_out, notes").eq("id", bookingId).maybeSingle();
  let info: FlightInfo | null = null;
  const { data: fi } = await db.from("exp_bookings").select("flight_info").eq("id", bookingId).maybeSingle();
  if (fi?.flight_info) info = fi.flight_info as FlightInfo;
  if (!info) info = parseFlightNote(base?.notes);
  if (base?.fly_in || base?.fly_out) {
    info = {
      ...(info ?? {}),
      arrivalDate: info?.arrivalDate ?? base?.fly_in ?? null,
      departureDate: info?.departureDate ?? base?.fly_out ?? null,
    };
  }
  return info;
}

export type ArrivalInfo = { airportCode: string | null; airportDistance: string | null; transportOptions: string[] };

/** Airport + transport info for an experience (shown in member Trip prep).
    Tolerant: airport_distance/transport_options arrive in migration 026. */
export async function getExperienceArrivalInfo(experienceId: string): Promise<ArrivalInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: base } = await db.from("exp_experiences").select("airport_code").eq("id", experienceId).maybeSingle();
  const out: ArrivalInfo = { airportCode: base?.airport_code ?? null, airportDistance: null, transportOptions: [] };
  const { data: extra } = await db.from("exp_experiences").select("airport_distance, transport_options").eq("id", experienceId).maybeSingle();
  if (extra) {
    out.airportDistance = extra.airport_distance ?? null;
    out.transportOptions = Array.isArray(extra.transport_options) ? extra.transport_options : [];
  }
  return out;
}

export type HotelInfo = { name: string; image_url: string | null; images: string[] | null; description: string | null; website: string | null; location: string | null; maps_url: string | null };

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
  const { data: hotels } = await db.from("hotels").select("id,name,image_url,images,description,website,location,maps_url");
  if (!Array.isArray(hotels)) return null; // media columns missing pre-migration → no stay module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hotel = hotelId ? hotels.find((h: any) => h.id === hotelId) : null;
  if (!hotel && pkgName) {
    const hay = pkgName.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hotel = hotels.find((h: any) => h.name && hay.includes(h.name.toLowerCase())) ?? null;
  }
  // A guest whose package has no hotel (e.g. a partner who books as a beginner
  // and shares someone else's room) still stays somewhere — resolve the hotel
  // from the room they're assigned to (as the main guest OR a shared occupant).
  if (!hotel) {
    try {
      const [{ data: r1 }, { data: r2 }] = await Promise.all([
        db.from("exp_hotel_rooms").select("hotel").eq("booking_id", bookingId).not("hotel", "is", null).limit(1),
        db.from("exp_hotel_rooms").select("hotel").contains("extra_booking_ids", [bookingId]).not("hotel", "is", null).limit(1),
      ]);
      const roomHotelName: string | null = r1?.[0]?.hotel ?? r2?.[0]?.hotel ?? null;
      if (roomHotelName) {
        const rn = roomHotelName.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hotel = hotels.find((h: any) => h.name && h.name.toLowerCase() === rn) ?? hotels.find((h: any) => h.name && rn.includes(h.name.toLowerCase())) ?? null;
      }
    } catch { /* room table/column absent → no room fallback, that's fine */ }
  }
  if (!hotel || (!hotel.image_url && !hotel.description)) return null;
  return { name: hotel.name, image_url: hotel.image_url ?? null, images: hotel.images ?? null, description: hotel.description ?? null, website: hotel.website ?? null, location: hotel.location ?? null, maps_url: hotel.maps_url ?? null };
}

export type CoachCard = { name: string; role: string; bio: string; image: string | null; whatsapp: string | null };

/** A week's coaches (exp_edition_coaches + exp_coaches, with per-edition overrides),
    mirroring the public experience page. Tolerant of whatsapp_link (migration 027). */
export async function getEditionCoaches(editionId: string): Promise<CoachCard[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const sel = (wa: boolean) => `sort_order,name_override,role_override,bio_override,image_override,exp_coaches(name,role,bio,image_url${wa ? ",whatsapp_link" : ""})`;
  const first = await db.from("exp_edition_coaches").select(sel(true)).eq("edition_id", editionId).order("sort_order");
  let data = first.data;
  if (first.error) ({ data } = await db.from("exp_edition_coaches").select(sel(false)).eq("edition_id", editionId).order("sort_order"));
  return (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((g: any) => ({
      name: g.name_override ?? g.exp_coaches?.name ?? "",
      role: g.role_override ?? g.exp_coaches?.role ?? "",
      bio: g.bio_override ?? g.exp_coaches?.bio ?? "",
      image: g.image_override ?? g.exp_coaches?.image_url ?? null,
      whatsapp: g.exp_coaches?.whatsapp_link ?? null,
    }))
    .filter((c: CoachCard) => c.name);
}
