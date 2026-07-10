import { createAdminClient } from "@/lib/supabase";
import { presignPut, presignGet, r2VideoEnabled } from "@/lib/r2-presign";

/**
 * "Signature Trips" — the public invite-only trip application funnel (migration
 * 079). Guests apply to be considered for special trips with a short pitch
 * video/voice recorded in-browser + uploaded straight to R2 (private). All DB
 * access is service-role; public submit + admin review go through server APIs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;
function db(): DB { return createAdminClient() as DB; }

export type ApplicationStatus = "new" | "shortlisted" | "accepted" | "declined";
export type MediaKind = "video" | "audio";

export type TripApplication = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  level: string | null;
  wants: string | null;
  motivation: string | null;
  media_key: string | null;
  media_type: MediaKind | null;
  status: ApplicationStatus;
  admin_notes: string | null;
  created_at: string;
  archived_at: string | null;
};

function row(r: Record<string, unknown>): TripApplication {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    phone: (r.phone as string | null) ?? null,
    level: (r.level as string | null) ?? null,
    wants: (r.wants as string | null) ?? null,
    motivation: (r.motivation as string | null) ?? null,
    media_key: (r.media_key as string | null) ?? null,
    media_type: (r.media_type as MediaKind | null) ?? null,
    status: (r.status as ApplicationStatus) ?? "new",
    admin_notes: (r.admin_notes as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    archived_at: (r.archived_at as string | null) ?? null,
  };
}

const EXT: Record<string, string> = {
  "video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov",
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav",
};

export type ApplyInput = {
  name: string; email: string; phone?: string | null; level?: string | null;
  wants?: string | null; motivation?: string | null;
  media?: { kind: MediaKind; contentType: string } | null;
};

/** Create an application. When a pitch is attached, presign a direct-to-R2 PUT
 *  and record the key up front (the browser uploads the blob next). */
export async function createApplication(input: ApplyInput): Promise<{ id: string; uploadUrl: string | null } | { error: string }> {
  const name = input.name?.trim(), email = input.email?.trim();
  if (!name || !email) return { error: "Name and email are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  const insert: Record<string, unknown> = {
    name, email,
    phone: input.phone?.trim() || null,
    level: input.level?.trim() || null,
    wants: input.wants?.trim() || null,
    motivation: input.motivation?.trim() || null,
  };

  let uploadUrl: string | null = null;
  let mediaKey: string | null = null;
  // Presign only when R2 is configured and a pitch is attached.
  const media = input.media;
  const canMedia = media && r2VideoEnabled() && (EXT[media.contentType] || media.kind === "video" || media.kind === "audio");

  const { data, error } = await db().from("exp_trip_applications").insert(insert).select("id").single();
  if (error || !data) return { error: error?.message || "Could not submit the application." };
  const id = String(data.id);

  if (canMedia && media) {
    const ext = EXT[media.contentType] || (media.kind === "video" ? "webm" : "webm");
    mediaKey = `_apply/${id}/pitch.${ext}`;
    try {
      uploadUrl = await presignPut(mediaKey, media.contentType, 900);
      await db().from("exp_trip_applications").update({ media_key: mediaKey, media_type: media.kind }).eq("id", id);
    } catch {
      uploadUrl = null; mediaKey = null; // media optional — application still stands
    }
  }
  return { id, uploadUrl };
}

/** Admin: every application (newest first, non-archived), with a short-lived
 *  presigned playback URL for the pitch. */
export async function listApplications(): Promise<(TripApplication & { playbackUrl: string | null })[]> {
  const { data } = await db().from("exp_trip_applications").select("*").is("archived_at", null).order("created_at", { ascending: false });
  const rows = ((data ?? []) as Record<string, unknown>[]).map(row);
  return Promise.all(rows.map(async (a) => ({
    ...a,
    playbackUrl: a.media_key ? await presignGet(a.media_key, 3600).catch(() => null) : null,
  })));
}

export async function updateApplication(id: string, patch: { status?: ApplicationStatus; admin_notes?: string }): Promise<TripApplication | null> {
  const clean: Record<string, unknown> = {};
  if (patch.status) clean.status = patch.status;
  if (patch.admin_notes !== undefined) clean.admin_notes = patch.admin_notes;
  if (Object.keys(clean).length === 0) return null;
  const { data } = await db().from("exp_trip_applications").update(clean).eq("id", id).select("*").single();
  return data ? row(data) : null;
}

export async function archiveApplication(id: string): Promise<void> {
  await db().from("exp_trip_applications").update({ archived_at: new Date().toISOString() }).eq("id", id);
}
