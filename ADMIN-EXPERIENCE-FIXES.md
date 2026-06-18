# Admin — Experience side: fixes & improvements (implementation plan)

Companion to `ADMIN-GAPS.md`. Captured 2026-06-19. Execution happens in a separate thread —
this is the concrete plan, not just the wishlist. Each item: **Issue → Plan (DB/API/UI/files) →
Effort**. Effort: **S** ≈ <½d · **M** ≈ ½–2d · **L** ≈ multi-day.

## Migrations needed (roll-up)
- ~~`exp_costs.edition_id`~~ — item J — ✅ **column already exists in DB** (UI-only now)
- ~~`hours_log.edition_id`~~ — item K — ✅ **column already exists in DB** (UI-only now)
- `destinations` new table + (optional) `exp_experiences.destination_id` — item I
- (Q2) optional `exp_experiences.thumbnail` if hero/thumb get split — item B
- All manual-apply per `APPLY_MIGRATIONS.md`.

## Suggested execution order
1. **Quick wins (S):** L (WIP badges) · E-remove-AI-summary · E-hotel-room-filter · F-component-page-filters.
2. **High-value (M):** E-bookings (button + participant flow) · F-package-picker-filter · A-dashboard ·
   D-editions tabs/toggles.
3. **Structural (M):** B + G sub-menus & tile consolidation · C duplication · J + K edition level ·
   M pipeline tidy.
4. **Big build (L):** I destinations (needs surfcenter URL).

---

## A. Dashboard (`/admin/page.tsx`) — Effort M  ✅ DONE
**Issue:** today it's 3 counters (experiences/bookings/contacts).
**Plan:**
- API: new `GET /api/admin/dashboard` aggregating the widgets in one call (faster than N fetches).
- UI: rewrite `page.tsx` as a card grid; add a reusable `<DashboardCard>`.
- Widgets — requested: latest bookings · upcoming editions (`date_start`) · upcoming pipeline actions ·
  recent/queued emails (`email_log`) · new members. **Suggested extra:** outstanding balances Σ +
  unmatched payments (`exp_payments`) · overdue to-dos · spots-filling (`max_spots` vs `spots_taken`) ·
  upcoming departures (`fly_in` 7–14d) · new leads (pipeline stage=new) · activity feed.
- Role-gate the money widgets (interim: `is_admin`; later: ROADMAP §8 access matrix).

## B. Experiences detail (`/admin/experiences/[id]/page.tsx`) — Effort M  ✅ DONE (relabel; sub-nav added)
**Issue:** flooded page (Editions → Template details → long ExperienceComponentsManager → media);
"Hero image" label misleading.
**Plan:**
- UI: wrap blocks in `<section id>` + a sticky in-page sub-nav (Editions · Template · Components ·
  Media). Collapse the long components block.
- Label: `hero_image` is **double duty** (public detail hero + list/card thumb + admin card). Per **Q2**:
  (a) relabel → "Main image (hero + card)", or (b) add `thumbnail` column + UI + update
  `experience/page.tsx` card to use it. Tile/thumb source consolidates into Event Content (§G).

## C. Duplication (`src/lib/duplicate.ts` + new routes) — Effort M  ✅ DONE
**Issue:** can't duplicate experiences/editions. `duplicateRow()` exists; packages already deep-copy
component links — experiences/editions just aren't wired.
**Plan:**
- `POST /api/admin/experiences/[id]/duplicate` → `duplicateRow` template + copy `exp_components`
  (where `experience_id` matches) [+ content per **Q1**]; editions NOT copied (recommended).
- `POST /api/admin/editions/[id]/duplicate` with body `{ target: 'existing'|'new', experienceId? }`.
  Deep-copy edition + `exp_packages` + their `exp_package_components` + cost structure;
  NOT bookings/payments/rooms-with-guests. UI: modal prompting **existing experience (picker) vs new**.
- Add "Duplicate" buttons on experiences + editions detail.

## D. Editions (`/admin/editions/[id]/page.tsx`) — Effort M
**Issue:** guides/reviews live on editions (tabs); other tabs lack show/hide; financials not role-gated.
**Plan:**
- Remove `guides` + `reviews` from the tab array; relocate their managers to Event Content (§G).
- Add `ColumnToggle` to the Bookings/Packages/Costs/Rooms tabs (today fixed columns; component exists).
- Role-gate the Details-tab `financials` section reveal (interim `is_admin`; later §8 matrix).

## E. Bookings — Effort M (+ two S sub-items)  ✅ DONE (E.1/E.2/E.3)
**Issue:** main "New Booking" button is a **TODO stub** (`onClick={() => {/* TODO */}}`, line 233);
edition booking form has **no participant** — only a free-text `name`.
**Plan:**
- Main page: build the new-booking modal (pick experience→edition→participant→create).
- Edition form (`editions/[id]/page.tsx`): replace `name` field with a **contact typeahead +
  "create new contact"**; set `contact_id`; **auto-generate `name`** = `{experience_code} {year} —
  {contact.name}`; change create-disabled to require contact. Update `emptyBooking`, `addBooking`
  insert, form JSX (~764–770).
- **S** ✅ Remove AI summary: delete from `contacts/[id]/page.tsx` (343–352) + `contacts/page.tsx` col (57,365).
- **S** ✅ Hotel-rooms experience selector (`/admin/hotel-rooms/page.tsx`): scope the dropdown (active /
  rooms-having experiences) instead of all.

## F. Components — Effort M
**Issue:** Notion-era naming; package picker lists ALL components; no filters on the components page.
**Plan:**
- **Real fix:** ✅ package component picker filters by `experience_id` via
  `GET /api/admin/components?experience_id=` (already shipped). `+year` deferred (low value;
  editor is already experience-scoped). Then names can stay short.
- Naming = plain label (e.g. "Coaching – beginner"); experience/category/year are structured fields.
  No schema change; optional one-off rename of existing rows.
- **S** ✅ Components page (`/admin/components/page.tsx`): add experience / year / experience+year filters.

## G. Event Content (`/admin/content`) — Effort M
**Issue:** everything on one page; tile image duplicated vs experiences/operations.
**Plan:**
- Sub-menu (same pattern as §B) in the content editor.
- Make the **tile image** single-source here; remove the duplicate selector under Operations/Experiences;
  point public + admin reads at it (coupled with §B hero decision).
- Host the relocated Guides & Reviews managers (from §D).

## H. Members (`/admin/members`) — Effort M
**Issue:** list-only; can't open a member; "log" not built.
**Plan:**
- New `/admin/members/[id]/page.tsx` + `GET /api/admin/members/[id]` showing attached bookings,
  payments, gallery, reviews, emails. Make list rows clickable.
- **S** "Log" → WIP badge (§L).

## I. Destinations (`/admin/destinations`) — Effort L  ⚠️ needs surfcenter URL (Q3)
**Issue:** **no data model** — page derives destinations from experience locations.
**Plan:**
- Migration: new `destinations` table (fields mirrored from surfcenter-experience.com → Destinations:
  name, region, country, description, images, best-season, conditions, travel info… — confirm via URL).
  Optional `exp_experiences.destination_id`.
- CRUD API + editor UI `/admin/destinations` + `[id]`.

## J. Experience Costs (`/admin/exp-costs`) — Effort S–M  ✅ DONE (UI; column pre-existed)
**Issue:** costs attach to experience only, not edition.
**Plan:** migration `exp_costs.edition_id` (FK); add edition selector to the cost form; edition
column/filter; update API. ("addition" = edition.)

## K. Hours Log (`/admin/hours-log`) — Effort S–M  ✅ DONE (UI; column pre-existed)
**Issue:** hours attach to experience only → can't do per-edition financials.
**Plan:** migration `hours_log.edition_id` (FK); add edition selector to the hours form; filter by
edition; update API. (Pairs with `ADMIN-GAPS` `booking_id` + ROADMAP §8 self-only hours.)

## L. "Under construction" badges (`admin-shell.tsx`) — Effort S  ✅ DONE
**Plan:** add optional `wip?: boolean` to the nav-item type; render a small 🚧 badge. Mark: **To-Dos**,
**Task Rules**, **Destinations** (until §I), **Members → Log**. Optionally a shared "under construction"
route stub.

## M. Pipeline Rules (`/admin/pipeline-rules`) — Effort M–L
**Issue:** flat table of **96 Notion-migrated rules** — and they're the **live source of truth** for
the email cron (`/api/cron/emails`), so don't delete blindly.
**Plan:**
- UI: group by trigger stage (timeline: lead→deposit→balance→pre-trip→post-trip, ordered by
  `days_after_trigger`); split global vs per-experience (`experience_id` filter); per-experience
  sequence preview; link each rule → its email template; trim columns to essentials.
- Cleanup: one-off audit report grouping by trigger+days+action+experience to surface duplicates /
  `language[]` dupes; collapse where safe. ⚠️ verify against cron logic before removing any rule.
- Document the cron↔rules contract in code so UI edits predictably change sends.

---

## Open questions for Nico
1. **Experience duplicate** — template + components only (recommended), or include editions?
2. **Hero vs thumbnail** — relabel one image, or split hero + card thumbnail?
3. **Destinations** — confirm the surfcenter-experience.com URL so the field model can be mirrored.
