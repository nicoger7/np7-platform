# Member level system — build plan (migration 036)

Status: **building on `dev`.** Migration 036 written; **not applied** until pasted into Supabase.
All reads/writes are tolerant of 036 being unapplied (columns/tables absent → dormant), so the
live site (035 applied) is unaffected.

## Concept

One **overall level** per member, but with *provenance* — it stops being an opinion and becomes
evidence-backed:

- **self** — the member picks their own level. Shown plainly.
- **suggested** — a coach proposes a level. **Private** (only the member + admin see it); never
  shown to other riders. The member sees an Accept / Keep-mine prompt.
- **verified** — the member accepted (or granted standing consent). Shown with a ✓ badge.

Two layers add the depth:

- **Milestones** — an editable, tiered catalog of can-do skills. A coach ticks them per member,
  and the completed set **derives a suggested level** (coach always has final say).
- **History** — every level change is appended to a timeline (powers "you leveled up" + rebooking
  nudges).

**Consent:** a member toggle `coach_can_manage_level`. On → a coach's level lands directly as
*verified*, no per-change prompt. Off → suggest-and-accept per change. We never auto-prompt a
member's existing level.

## Schema — migration 036

`contacts` (the existing `level` becomes the coach's value; `level_notes` is the rationale):
| Column | Type | Meaning |
| --- | --- | --- |
| `self_level` | `text` | member's self-declared level |
| `level_status` | `text` | `self` · `suggested` · `verified` |
| `coach_can_manage_level` | `bool` | standing consent for coach to set+verify |
| `level_verified_at` | `timestamptz` | when it became verified |

New tables:
- `level_milestones` — catalog: `key`, `label`, `tier` (Beginner/Intermediate/Advanced/Pro),
  `discipline`, `sort_order`, `active`. Seeded with a windsurf ladder.
- `contact_milestones` — `(contact_id, milestone_id)` a member has achieved + `set_by`, `achieved_at`.
- `contact_level_history` — append-only: `level`, `status`, `source` (self·coach·milestone),
  `note`, `created_by`, `created_at`.

RLS: catalog public-read / team-write; member milestones + history owner-read / team-write
(portal still served via service-role routes).

## Display rules

- Public/community level = `level_status === 'verified' ? level : self_level`; ✓ badge only when
  verified. A `suggested` status is **never** shown publicly.
- Derived suggestion = the highest tier whose milestones (and all lower tiers') are fully ticked.
  Transparent; the coach can override up or down.

## Surfaces to build

1. **Schema** — migration 036 + seed.
2. **`src/lib/member-level.ts`** — `LEVELS`, `LevelStatus`, `deriveSuggestedLevel`, `displayLevel`,
   tier helpers. Pure.
3. **Data** — `portal-data.ts`: `getMemberLevel` (level + status + consent), `getMemberMilestones`
   (catalog + achieved), `getMemberLevelHistory`. Projection (`publicProfileFor`) uses the display
   level + a `levelVerified` flag. All tolerant.
4. **Member** — a "Your level" block on `/account/profile`: self-set, consent toggle, accept-pending
   card, "your progress" milestone view, history. API: `PUT /api/portal/level`.
5. **Coach (admin)** — on the member detail page: milestone checklist (tick/untick), set/suggest
   level, history. API under `/api/admin/contacts/[id]/level` + `/milestones`.
6. **Public projection** — crew + community profile show verified(✓)/self; pending stays private.

## Deferred
- Milestone **catalog editor** UI (seed + SQL covers it for now; admin tick/untick works against
  the seeded catalog).
- Per-discipline levels (chose one overall level; catalog carries an optional `discipline` tag for
  later).
- Showing ticked milestones as public "verified skills" (kept private for v1).
