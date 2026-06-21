/* Member community-profile model — the single source of truth for how one
   member is projected to another. Pure (no server imports) so the same types,
   defaults and projection run on the server (portal-data, routes) and in the
   client settings UI. Privacy is by projection: `publicProfileFor` is the only
   way a contact becomes visible to someone else, and it returns null unless the
   owner opted into that specific surface. */

import { displayLevel } from "@/lib/member-level";

export type ProfileSurface = "crew" | "reviews" | "spot_notes";
export type ProfileField = "age" | "country" | "city" | "level";

export type Visibility = {
  surfaces: Partial<Record<ProfileSurface, boolean>>;
  fields: Partial<Record<ProfileField, boolean>>;
};

export const EMPTY_VISIBILITY: Visibility = { surfaces: {}, fields: {} };

/** Tolerant parse of the jsonb column (or anything) into a Visibility. */
export function parseVisibility(raw: unknown): Visibility {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v.surfaces && typeof v.surfaces === "object" ? v.surfaces : {}) as Record<string, unknown>;
  const f = (v.fields && typeof v.fields === "object" ? v.fields : {}) as Record<string, unknown>;
  const pick = <K extends string>(o: Record<string, unknown>, keys: K[]) =>
    Object.fromEntries(keys.filter((k) => o[k] === true).map((k) => [k, true])) as Partial<Record<K, boolean>>;
  return {
    surfaces: pick(s, ["crew", "reviews", "spot_notes"] as ProfileSurface[]),
    fields: pick(f, ["age", "country", "city", "level"] as ProfileField[]),
  };
}

/** "Nico Prien" → "Nico P."; "Nico" → "Nico"; empty → "Member". */
export function firstNameInitial(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Member";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last[0].toUpperCase()}.`;
}

/** Up to two uppercase initials from a name, for the fallback avatar. */
export function initialsFrom(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Whole years from an ISO date, or null if unparseable. */
export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export const MINOR_AGE = 18;

/** Self-declared community level (separate from the coach-assessed contacts.level). */
export const SELF_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"] as const;
export type SelfLevel = (typeof SELF_LEVELS)[number];

/** Normalise a desired self-level to the canonical set, or "" to clear it. */
export function normalizeSelfLevel(raw: unknown): SelfLevel | "" {
  if (typeof raw !== "string") return "";
  return (SELF_LEVELS as readonly string[]).includes(raw) ? (raw as SelfLevel) : "";
}

/** The shape of a `contacts` row this module needs. Kept loose so callers can
    pass the raw service-role row (extra keys ignored). */
export type ContactProfileRow = {
  id: string;
  name: string | null;
  username?: string | null;
  avatar_url?: string | null;
  country?: string | null;
  display_city?: string | null;
  self_level?: string | null;     // member's self-declared (migration 036)
  level?: string | null;          // coach's value (legacy/operational)
  level_status?: string | null;   // self | suggested | verified (migration 036)
  date_of_birth?: string | null;
  profile_visibility?: unknown;
};

/** What a member looks like to another member. */
export type PublicProfile = {
  contactId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  initials: string;
  level: string | null;
  levelVerified: boolean;
  skills: string[]; // verified skill labels, shown on hover (enriched by the caller)
  country: string | null;
  city: string | null;
  age: number | null;
};

/**
 * Project a contact to its public profile **for one surface**, honouring the
 * owner's toggles. Returns null when the owner hasn't opted into `surface` — so
 * a null result is the privacy default and must be treated as "not visible".
 */
export function publicProfileFor(contact: ContactProfileRow, surface: ProfileSurface): PublicProfile | null {
  const vis = parseVisibility(contact.profile_visibility);
  if (!vis.surfaces[surface]) return null;
  const age = vis.fields.age ? ageFrom(contact.date_of_birth) : null;
  // verified → coach value (+ badge); else self-declared; else legacy `level`
  const dl = displayLevel(contact);
  return {
    contactId: contact.id,
    displayName: firstNameInitial(contact.name),
    username: contact.username ?? null,
    avatarUrl: contact.avatar_url ?? null,
    initials: initialsFrom(contact.name),
    skills: [], // enriched server-side (getCrewProfiles) for verified members
    level: vis.fields.level ? dl.level : null,
    levelVerified: vis.fields.level ? dl.verified : false,
    country: vis.fields.country ? contact.country ?? null : null,
    city: vis.fields.city ? contact.display_city ?? null : null,
    // never surface the age of a minor, regardless of the toggle
    age: age != null && age >= MINOR_AGE ? age : null,
  };
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Normalise + validate a desired username. Returns the canonical value or an
    error message. Strips a leading "@", lowercases. */
export function normalizeUsername(raw: unknown): { value: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Invalid username." };
  const v = raw.trim().replace(/^@+/, "").toLowerCase();
  if (v === "") return { value: "" }; // clearing the handle is allowed
  if (!USERNAME_RE.test(v)) return { error: "3–20 characters: letters, numbers, underscore." };
  return { value: v };
}
