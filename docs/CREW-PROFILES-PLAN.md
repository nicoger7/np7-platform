# Member profiles & trip "crew" — build plan

Status: **built on `dev`, not shipped.** Migration 035 is written but **not applied**; all
code is tolerant of the unapplied migration (new columns absent → features stay dormant).
Nothing is pushed or deployed. Apply 035 + reveal when ready.

## Why

Per-trip coordination currently lives in WhatsApp. WhatsApp keeps winning the real-time
chatter (zero friction, everyone's already there) — we don't try to replace it. Instead the
platform owns the **durable, CRM-connected layer**: a member can see who else is on their
trip, and a single opt-in **community profile** identifies them anywhere they show up on the
site (trips, reviews, spot notes). The cohort relationship is the rebooking engine WhatsApp
can't give us because we don't own it.

## Core principle — privacy by projection, never by RLS

`contacts` RLS (migration 016) lets a member read only their **own** row — and that must
stay, because the row holds DOB, diet/allergies, phone. Member-to-member visibility is
therefore served **only** through a service-role projection that returns the opted-in public
fields. There is exactly one chokepoint (`getCrewProfiles`, `publicProfileFor`) and it is the
only place that can ever surface one member to another. Everything is **opt-in, default off**
(consistent with `marketing_opt_in`), and per-surface.

## Data model — migration 035 (additive, Notion-safe)

New columns on `contacts` (all nullable, additive — Notion sync rule honoured):

| Column | Type | Notes |
| --- | --- | --- |
| `username` | `citext unique` | optional handle, `@`-less storage, 3–20 chars `[a-z0-9_]` |
| `avatar_url` | `text` | chosen from the member's own trip photos (upload = later) |
| `display_city` | `text` | optional, more identifying than `country` → own field toggle |
| `self_level` | `text` | member's self-declared level (Beginner/Intermediate/Advanced/Pro) |
| `profile_visibility` | `jsonb default '{}'` | surface + field toggles (see below) |

Reused as-is: `name` (→ "Nico P."), `country`, `date_of_birth` (→ age). The coach-assessed
`level` (+ `level_notes`) stays **team-owned** and is never touched by the portal — the community
profile uses the separate, member-editable `self_level` so a self-rating can't overwrite a
coach's operational assessment. The community profile shows `self_level` only (no fallback to the
assessed `level`).

`profile_visibility` shape (all default false/absent):

```jsonc
{
  "surfaces": { "crew": true, "reviews": true, "spot_notes": false },
  "fields":   { "age": true, "country": true, "city": false, "level": true }
}
```

A partial unique index enforces username uniqueness only when set:
`create unique index … on contacts (lower(username)) where username is not null`.

## Display rules (server-computed, never stored redundantly)

- **Name** → `firstNameInitial(name)` = first token + first letter of last token + ".", e.g.
  `"Nico Prien"` → `"Nico P."`. Falls back to first token only if no surname.
- **Age** → derived from `date_of_birth`; shown only if `fields.age` and **18+**.
- **Under-18 guard** → minors are *never* included in a crew roster or shown an age,
  regardless of toggles.
- **Avatar** → `avatar_url` if set; else initials circle from `name`.

## Surfaces

### Phase 1 — Foundation (the reusable core)
- Migration 035.
- `src/lib/member-profile.ts` — `Visibility` type, defaults, `firstNameInitial`, `ageFrom`,
  `publicProfileFor(contact, viewerContext)` projection, `parseVisibility`/`mergeVisibility`.
- `portal-data.ts` — extend `MemberProfile` (tolerant read of the new columns), add
  `getProfilePhotoChoices(contactId)` (their gallery photos, for the avatar picker).
- `PUT /api/portal/profile` — accept `username` (validated, uniqueness-checked), `avatar_url`,
  `display_city`, `profile_visibility`. Reject taken/invalid usernames with a field error.
- `community-profile.tsx` — a "Community profile" section on `/account/profile`: avatar picker
  (from gallery), username, city, per-surface toggles, per-field toggles, and a live
  "this is how others see you" preview card. All default off; nudge to add a photo.

### Phase 2 — Crew
- `getCrewProfiles(editionId, viewerContactId)` — service-role; everyone with a booking on
  that edition who has `surfaces.crew = true` and is 18+, projected to public fields. Returns
  counts (`going`, `sharing`) too.
- `crew-card.tsx` — compact teaser, merged with the existing "Your group" WhatsApp card in the
  trip dashboard right column: overlapping avatars, "N going · M sharing", "See who's going →",
  WhatsApp join button.
- `/account/bookings/[id]/crew/page.tsx` — full roster grid (avatar, "Nico P.", level badge,
  country/city, age), plus a note for those not sharing. Guards: caller must own the booking.

### Phase 3 — Community attribution (enhancement, lowest risk)
- **Spot notes (built):** public spot-note bylines render the avatar + "Nico P." when the
  author opted into `surfaces.spot_notes`. The frozen `author_name` snapshot stays as the
  fallback, so nothing regresses if a profile is private or the column is missing. Enriched via
  `getCommunityAuthors(contactIds, "spot_notes")` (service-role projection) in the blog page.
- **Reviews (consent only, render deferred — deliberate):** review cards on the experience page
  are *admin-curated marketing testimonials* with a controlled name, photo and a "verified"
  badge. Auto-overriding them with a member avatar would override curation, so we do **not** do
  that. The `surfaces.reviews` toggle still captures consent, and `getCommunityAuthors(_,
  "reviews")` is ready, for when public profile pages (`/u/[username]`) land and a "by
  @username → profile" link becomes meaningful.
- No schema change beyond 035.

## Rollout checklist (when ready to ship)
1. Paste `supabase/migrations/20260621_035_member_profiles.sql` into the Supabase SQL editor.
2. Create a public `avatars` storage path only if/when upload (vs gallery pick) is added.
3. Smoke-test `/account/profile` → set a profile → `/account/bookings/[id]/crew`.
4. No feature flag needed: the crew card self-hides when no one on the edition is sharing.

## Deliberately deferred
- Avatar **upload** (v1 = pick from existing trip photos only).
- Public profile **pages** (`/u/[username]`) — usernames are reserved now so we can add later.
- DMs / "say hi" — out of scope; WhatsApp remains the chat layer.
