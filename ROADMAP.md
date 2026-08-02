# NP7 Platform — Roadmap & Ideas

> **Purpose:** Single overview of where the platform stands, what's in flight, and the
> backlog of ideas. Planning happens in the planning thread; execution happens in a
> separate thread that reads this file. Keep it current.
>
> _Last updated: 2026-06-18_

---

## Legend
`🔴 broken / urgent`  `🟡 in progress`  `🟢 done`  `⚪ not started`  `💡 idea`

---

## ⭐ Current outstanding — live checklist (2026-06-20)

**Building now**
- ⚪ **Magazine** — promote blog to a standalone "Magazine" world (own /magazine identity), link **right-bound** in BOTH Experience + Hardware headers (next to member icon, persists across worlds), make it kick-ass (featured story, categories, rich articles). *(blog exists at /experience/blog but as a plain sub-section.)*
- 🟡 **Registration redesign** — Phase 1 done (free signup→lead, BotID, welcome mail, registered status, Secure-your-spot banner, spots=paid-only). Next: invoice-engine adaptation (pro-forma → real invoice, deposit-deducted/add-on math, configurable deposit + 50% downpayment + 90-day final, all "due-by" deadlines, Surfcenter company settings, pay-by-bank-transfer flow).
- 🟡 **Waiver** — member sign flow done (draw signature + audit). Next: admin signed/pending view + per-experience editor + signed PDF doc + "Sign your waiver" link on booking + travel-partner (partner_tag_along) & level capture form.

**Dropped / needs input**
- ⚪ **Destination pages** — detail page exists (/destinations/[slug]) but unclear if it matches the surfcenter examples; not linked from nav; no index page. NEED the example re-shared.

**Pending migrations (DB agent):** 029 (email header_image), 030 (contacts.marketing_opt_in), 031 (waiver).

**Go-live switches (later):** EMAIL_LIFECYCLE_LIVE=true (when admin data clean); SHOW_EXPERIENCE=true (reveal); confirm BotID dev build green.

**Legal / trust before public reveal:** Impressum, AGB, privacy + cookie-consent banner, package-travel pre-contractual form — naming **Surfcenter** as operator for now (they carry the Sicherungsschein). Sold-out gate (stop securing at capacity). Email bounce handling. Error monitoring. Team notifications on new registration/add-on. SEO/OG meta.

**Ops:** Simona invite still not received (mailbox? Email Log? spam). Email image reposition (focal point). Set up Supabase token so Claude can run migrations + read Email Log itself.

**Everything above is staged on `dev` (behind SHOW_EXPERIENCE). Not live on main.**

---

## 0. Urgent / breaking

- 🔴 **Editions-refactor query bugs** — public + API code still reads columns that moved
  from `exp_experiences` to `exp_editions` (`date_start`, `date_end`, `price`, etc.).
  Will crash. Files: `src/app/experience/page.tsx`, `src/app/experience/[slug]/page.tsx`,
  `src/app/api/admin/bookings/route.ts`, `src/app/api/admin/bookings/[id]/route.ts`.
  See `ADMIN-GAPS.md` → "CRITICAL BUG" section.
- 🟡 **Pending migrations** — 021 (invoicing) + **022 (destinations)** need manual apply
  (019/020 applied). See `APPLY_MIGRATIONS.md`. Invoicing: Sicherungsschein = go-live blocker;
  destinations editor (item I) won't work until 022 is applied.

---

## 1. Surfaces

### Experience site (`/experience`)
- 🟢 List + detail pages, legal
- 🟡 **Blog** — admin + API + public pages in progress (uncommitted)

### Hardware shop (`/hardware`)
- 🟢 Product pages + per-product Find-Your-Fit (phase 1)
- 🟢 Per-world admin dashboard (Hardware world shows its own KPIs, 2026-07-27)
- 🟡 **Hardware backend** — full blueprint researched & written 2026-07-27:
  `docs/hardware-backend-blueprint.md` (+ 3 deep-research reports in `docs/research/`).
  Phases: 1 catalog/suppliers/POs/inventory-ledger → 2 D2C checkout+orders+3PL+returns
  → 3 B2B dealer portal → 4 scale. Checkout (old "phase 2") is now part of blueprint Phase 2.

### Member area (`/account`)
- 🟢 Auth, bookings, cart, gear, profile
- 🟢 Participant review submission flow

---

## 2. Admin panel (Notion replacement)
~28 sections live. Cross-cutting work:
- 🟡 **Column gaps** — many pages miss DB columns in the UI. Full list in `ADMIN-GAPS.md`.
- 🟢 **Experience-side fixes punch-list (A–M) — DONE** (`ADMIN-EXPERIENCE-FIXES.md`). Carry-forwards:
  apply migration 022; D's financials role-gate waits on §8 access matrix; M's duplicate/language
  audit + rule→template links are a separate data task; F `+year` filter skipped.
- ⚪ **Standalone Payments page** — payments only visible inside booking detail today.

Top of the `ADMIN-GAPS.md` priority list:
1. Build standalone Payments page
2. Bookings list (8 missing columns)
3. Pipeline Rules (8 missing columns)
4. Packages list (7 missing + computed margin)
5. Scenario Planner (10 missing + computed fields)

---

## 3. Backend systems

### Email pipeline  🔴 SUPER IMPORTANT — provider go-live
- 🟢 Sending fully built + provider-abstracted: `src/lib/email/send.ts` → `sendEmail()`
  (renders templates, logs to `email_log`, idempotent `dedupe_key`, graceful no-op w/o key).
  Lifecycle cron `/api/cron/emails` + templates + admin email-log/templates all live.
- ✅ **Decision: go live on Resend** — code is already wired (`RESEND_API_KEY`, api.resend.com).
  Mailgun rejected: needless provider swap. **Code change = ZERO**; work is account + DNS + env.

**Resend go-live checklist** (account/DNS = Nico; env wiring = execution thread):
1. Create Resend account → **Add Domain** `np-seven.com` (or a `send.` subdomain).
2. Add the DNS records Resend shows at the registrar: **SPF + DKIM** (required), **MX** for the
   send subdomain (bounces), **DMARC** TXT (`p=none` → tighten later). Wait for "Verified".
3. Create a Resend **API key**.
4. Set env (Vercel + local): `RESEND_API_KEY`, `EMAIL_FROM`
   (default `NP7 Experience <hello@np-seven.com>`).
5. **From addresses per division** — Experience vs Hardware brand (open: HW from-address/domain?).
6. (Optional) Resend **webhooks** → update `email_log` (delivered/bounced/complained) + suppression.
7. Marketing vs transactional split; List-Unsubscribe header; UWG double opt-in for newsletter.
8. 🚨 **Set `EMAIL_PIPELINE_LIVE_FROM` at go-live** — or the cron emails historical bookings
   BACKWARDS through their lifecycle. The booby trap. Never email backwards.
9. Test: send to mail-tester.com (aim 10/10), confirm SPF/DKIM/DMARC pass; warm up gradually.

### Invoicing (migration 021)
- 🟢 Schema: company_settings per division, gapless invoice numbering, documents
- ⚪ Admin UI for company settings + document generation
- ⚪ Member portal: read own invoices (ownership check)
- Notes: §25 margin VAT mode vs standard; PDFs rendered server-side w/ service role.

---

## 4. Website-behaviour analytics  ⚪ NEW — flagship build
**Decision:** build custom into the admin on Supabase (not a 3rd-party tool).
**Why build:** data lives next to the CRM, so behaviour ties directly to
contacts/bookings — the one thing PostHog/GA can't do. Covers both divisions.
**Scope goals:** conversion funnels · what gets attention · traffic sources · tie
behaviour to CRM.
**Out of scope (build can't match a tool):** session replay, heatmaps. Revisit
with a bolt-on tool later only if needed.

### Data model (Supabase)
- `analytics_events` — append-only log. Cols: `id`, `visitor_id` (1st-party,
  persistent), `session_id` (30-min idle), `contact_id` (FK, nullable —
  identity stitching), `division` ('experience'|'hardware'), `event_type`,
  `path`, `referrer`, `utm_*`, `entity_type`/`entity_id` (product/experience/
  edition), `properties` (jsonb), `device`/`browser`/`os`, `country`, `created_at`.
- Rollup tables or materialized views for dashboards (raw events are high-volume):
  daily aggregates per division / page / source + funnel step counts. Refresh via
  existing cron infra.
- **Identity stitching:** when a member logs in or a lead submits an inquiry/booking
  with an email, backfill `contact_id` onto that `visitor_id`'s prior events.

### Collection
- Client: `<AnalyticsTracker>` in root layout — captures UTM/referrer on session start,
  fires `page_view` on App-Router route change, exposes `track(event, props)`. Sends via
  `navigator.sendBeacon`, batched. **Tier A** sends with no device identifier;
  **Tier B** only adds the persistent `visitor_id` (localStorage) / `session_id` once
  consent is granted (see Privacy section).
- Server: emit trustworthy conversion events from existing API routes
  (booking created, inquiry submitted, order placed) — these carry `contact_id` directly.
- Ingest: `/api/track` (POST) → validate, enrich (UA parse, geo→country, **drop raw IP**),
  insert with service role. Basic bot filtering + rate limit.

### Funnels (per division)
- **Experience:** visit → experience view → inquiry → booking confirmed
- **Hardware:** visit → product view → Find-Your-Fit complete → add to cart → checkout*
  (*checkout = HW phase 2, not built yet)

### Admin dashboard (`/admin/analytics` — replace the stub)
- **Overview** — visitors / sessions / pageviews / conversions + trends; Experience↔Hardware
  toggle (fits the existing admin mode toggle).
- **Funnels** — step counts + drop-off % per division, segmentable by source.
- **Attention** — top pages / products / experiences, scroll depth, FYF completion rate.
- **Acquisition** — UTM/referrer sources and which ones convert.
- **People (CRM tie-in)** — behaviour timeline on the contact detail page
  ("viewed Board X → completed FYF → viewed Maldives → booked").

### Privacy / GDPR — two-tier model (EU-conform, must address from day 1)
No consent banner exists yet; build one as part of this. German **TTDSG §25**: storing
*any* device identifier (incl. localStorage `visitor_id`) needs consent. Linking behaviour
to a contact = personal data under GDPR. So split collection into two tiers:

- **Tier A — anonymous, consent-free (runs for everyone).** Truly cookieless: no
  localStorage, no persistent ID. Server derives session via a **daily-rotating salted
  hash** of IP+UA that is never stored raw and rotates every 24h (Plausible-style).
  Yields pageviews, top pages/products, traffic sources, **aggregate** funnel step-counts.
- **Tier B — identified, consent-gated (opt-in only).** Persistent `visitor_id`, session
  stitching, and the CRM tie-in (contact behaviour timeline). Fires **only after explicit
  consent**. This is the part that needs the banner.

**Consent banner (new, platform-wide component):**
- Reject as easy/prominent as Accept; no pre-ticked boxes; **no Tier-B tracking before opt-in**.
- Granular (analytics vs. any future marketing); easily withdrawable.
- Log consent: `consent_log` (visitor/contact, timestamp, version, choices). Tracker reads
  consent state before firing Tier-B events (Consent-Mode style gate).

**Other GDPR duties:**
- No raw IP stored anywhere (derive country, discard). First-party only, no 3rd-party trackers.
- Retention: raw-events TTL (e.g. 14 months) + cleanup cron.
- DSAR: contact export/delete must include their analytics events.
- Document in privacy policy + Art. 30 record; **DPIA likely required** (profiling tied to
  identity). See `legal-framework-booking`.
- ⚠️ Not legal advice — have final consent copy + the Tier-A "consent-free" boundary reviewed
  by the DPO/lawyer before go-live.

### Phasing  _(consent moved up — it gates Tier B from the start)_
1. **Foundation + consent** — events table, `/api/track` ingest, **consent banner +
   `consent_log` + gating**, Tier-A cookieless collection (page_view) for everyone,
   Tier-B `visitor_id` collection for consenters, server-side conversion events. Just collect.
2. **Dashboards** — overview + acquisition + attention; rollup views/cron; division toggle.
3. **Funnels + CRM tie-in** — funnel computation, identity stitching, contact timeline (Tier B).
4. **Polish** — retention cron, bot filtering, DSAR hooks, CSV export.

---

## 5. Guest memories & galleries  ⚪ NEW
Member-area feature. Greenfield — no `/account/photos` gallery exists yet.

**Share-your-memories flow**
- NP7/videographer uploads trip photos into each guest's gallery (see §6).
- Email reminder (reuse email pipeline / `pipeline_rules`) nudges the guest post-trip to share.
- Guest logs in → gallery → selects images → applies a simple branded template → shares
  (download branded render + suggested caption; Web Share API on mobile).
- Template: NP7 brand (sun→sea warmth), social sizes (1080² post, 1080×1920 story), rendered
  server-side (og-image/Satori style) from chosen image(s) + logo/handle/hashtag.
- Value: UGC amplification → tie shares into analytics (Tier B) + marketing.

**Download limits (cost control)**
- Cap: **3 full-package downloads** per member, then **view-only**.
- Track in `media_downloads` log (member, package/edition, ts). At 3 → hide download, serve
  medium-res previews only; full-res lives in the zip.
- Pre-generate the package zip once + cache (don't regenerate per download = compute cost).
- Communicate "3 downloads included" upfront. NOTE: real cost lever is egress (see §6); the
  cap is a guardrail, not the main fix.

**GDPR / image rights**
- NP7 uploading guest photos + guests appearing in others' shots → German *Recht am eigenen
  Bild* + GDPR. Need a **photo/video media release** at booking. See `legal-framework-booking`.

## 6. Media pipeline & access  ⚪ NEW — cross-cutting backbone
Underpins guest galleries (§5), videographer content, and download costs. Decide storage/CDN
here once; several features depend on it.

**Storage / CDN (key cost decision)**
- Supabase storage egress is pricey at photo/video volume. Recommend heavy media on a
  **cheap-egress CDN**: Cloudflare R2 (zero egress) or Bunny for photos; a video service
  (Mux / Cloudflare Stream / Bunny Stream) for videographer video (streaming + view-only,
  limited/no download). This — not the 3-download cap — is what actually controls cost.
- Signed URLs for access; image transforms for view-only previews.

**Videographer / media upload portal** — ✅ _decided: separate `/studio` surface + `media` role_
- `media` is a tier in the unified `access_role` model — see §8 (owner|admin|staff|media).
  Today auth is binary (active team member) — `src/lib/admin-auth.ts`.
- Media role logs into a dedicated minimal route group (e.g. `/studio`) that ONLY does upload
  + own uploads. Middleware blocks media role from `/admin/*` entirely (defense in depth —
  unreachable, not just hidden).
- Uploads organized by edition/trip → assigned to guest galleries (videographer tags guest, or
  uploads to edition and admin/automation assigns).
- Large video → resumable/direct-to-storage uploads (tus / signed multipart).

## 7. Blog / Magazine  🟡 in progress — ✅ shared magazine
Currently `exp_blog_posts` (Experience-prefixed), routed only at `/experience/blog`, free-text
`category`, author default "Nico Prien". Build is **in progress (uncommitted)** — structure
choice is cheapest to make NOW before it hardens.

**✅ Decided: ONE shared store, segmented, surfaced in multiple places.**
- Generalize `exp_blog_posts` → unified posts with `division` ('experience' | 'hardware' |
  'both') + a real `category` taxonomy.
- Render: global magazine at `/magazine` (or `/blog`) + contextual filtered feeds —
  `/experience/blog` (experience + both), `/hardware/blog` (hardware + both).
- **Why shared:** concentrates SEO authority in one hub; cross-pollination (trip reports mention
  gear; gear deep-dives reference where they're tested) — audiences overlap. One editorial
  pipeline. Still get topical sections without splitting domain authority across two thin blogs.
- ⚠️ Time-sensitive: execution thread should generalize schema + routing before the
  Experience-only shape ossifies.

---

## 8. Team roles, permissions & invites  ⚪ NEW
Asked: (a) team members log only their OWN hours; (b) Nico = **owner**; (c) a panel to set
roles + invite team. Shares the role model with §6 (media).

**Current state / footgun**
- `team_members.role` is a CHECK enum (`'admin'|'editor'|'coach'|'operations'`) but the team UI
  edits it as **free text**, and it doubles as job title AND permission: `is_admin()` =
  `role='admin'` (delete rights); everyone else = generic `is_team_member()`. No `owner`, no
  self-only hours, no team invite flow.
- ⚠️ Admin app uses the **service-role client → bypasses RLS**. Access control lives in the API
  routes (+ middleware); RLS is defense-in-depth. So self-only hours is enforced in the
  hours-log API, mirrored in RLS.

**Recommended model (additive, low-risk)**
- Add `access_role` enum: `owner | admin | staff | media` (media = §6 videographer). Keep `role`
  as descriptive job title (or rename → `title`). Backfill: existing 'admin' → admin, others →
  staff, Nico → owner.
- Helpers: `is_admin()` → `access_role IN ('owner','admin')`; add `is_owner()`.

**Deliverables**
1. **Hours self-only** — hours-log API forces `employee_id = self` for `staff`; insert/update/
   delete limited to own rows; list filters to own. Owner/admin manage all. Mirror in RLS.
   (`hours_log.employee_id`; `src/app/api/admin/hours-log/route.ts` + `[id]`.)
2. **Roles** — `/admin/team`: access-role **dropdown** (not free text), owner-only editable;
   last-owner protection; non-owners can't self-escalate.
3. **Invite panel** — name + email + role → pending `team_members` row → invite email via Resend
   (mirror `/api/admin/members` invite + passwordless activation binding `auth_user_id`, per
   `legal-framework-booking`). Deactivate vs delete.
4. **Page-access matrix (✅ decided)** — owner-only page (e.g. `/admin/access`) with a
   **roles × admin-pages grid of checkboxes**. Owner toggles which roles reach which pages; each
   role then sees only its allowed nav + routes.
   - `ADMIN_PAGES` registry in code (stable `page_key` per section) = single source for nav + grid.
   - `role_permissions` table (`role`, `page_key`, `can_access`) — owner-editable; ship sensible
     defaults (owner=all; admin=all−access page; staff=limited; media=none/studio).
   - 🔒 **Enforce server-side, not just by hiding nav** — gate page routes (middleware) AND every
     admin **API route** by `page_key`. Nav-hiding ≠ security, esp. since admin uses service-role
     (RLS bypassed). This is the load-bearing part.
   - Granularity = page-level **view** access for v1. Finer rules sit on top: hours self-only
     (deliverable 1) is row-level; per-page edit/delete can come later.

**Role management = owner only** (✅). Admins run day-to-day but can't reshape the team or the matrix.

---

## 9. Product Development — R&D build sheets  🟡 in progress — ⚪ NEW

_The `product-dev` admin world (violet) existed but was empty. Everything NP7 knows about how its own
gear is made lives in a supplier's inbox and a JPEG of a layup diagram — this makes it ours._

**Phase 1 — build sheet 🟡 built, migration pending.** Migration `129` (9 `pd_*` tables), `src/lib/product-dev.ts`,
RBAC + nav + archive wiring, 10 API route pairs, the projects list, the detail tabs, the 18-row ply editor,
`<PlyDiagram>`, compare-across-molds, and `scripts/seed-rockstar.mjs`.
Model: project → construction → (mold + layup) → plies; process → steps; every parameter cites a source.
**The mold↔construction matrix is the set of `pd_layups` rows and the gaps between them** — 4 rows exist,
8 pairs deliberately don't. Generalises to boards with no schema change (`GEOMETRY_FIELDS[kind]`).

- 🔴 **Migration 129 not applied** — keychain access to the Supabase token is blocked, so it needs a
  dashboard paste. Nothing works until then; the seed script refuses to run without it.
- ⚪ Confirm with Phil: is the ply-9 → ply-10 length reset (30 → 36 cm) the two sides of the blade?
  The `stack` column is seeded `a`/`b` on that inference.
- ⚪ Per-ply materials are transcribed **by eye** from the diagram's colours — the seed prints them back
  colour-coded for sign-off. Template refs and lengths are exact.
- ⚪ Post-deploy: open `/admin/roles`, tick the Product Development world per custom role, and remove the
  stray Owner grants migration 049 handed out. Until then the RBAC work is inert.

**Phase 2 — media lock ⚪.** `product-dev/` becomes a reserved storage root, filtered **unconditionally**
(including for Owner) out of all five verbs of `/api/admin/images`, so R&D photos never appear in the 15
Experience/Hardware picker mounts or File Storage. Reads go through `/api/admin/product-dev/media`.
⚠ This is discoverability, **not** access control — the `assets` bucket is public and there are four
unauthenticated URL paths to any object. A private bucket is a later, more expensive call.

**Phase 3 — builder + versioning ⚪.** Migration `130`: `pd_revisions`, an append-only jsonb snapshot per
save that changes something, with a computed `change_summary` and optional named releases ("357-b — sent to
Ralph"). Live rows stay editable; history is immutable. Plus the Sources tab with a **paste-an-email box**
and the reverse citation index.

**Phase 4 — board-test panel ⚪.** Migration `131`: `pd_prototypes`, `pd_test_sessions` (linked to real
spotguide `spots`), `pd_test_recordings`. Record a voice memo on mobile → R2 via presigned PUT → jibe
transcribes → Claude turns the transcript into a structured review.
⚠ **The Claude API does not accept audio** — speech-to-text needs a separate engine. Plan: `whisper.cpp` on
jibe's always-on box (which already runs ffmpeg for trip videos), handed off via the proven
`spot_intake_queue` pattern. Needs `ANTHROPIC_API_KEY` + `CRON_SECRET` in Vercel (still unset).

---

## 10. Backlog / ideas
_Dump ideas here; we triage into the sections above._

- _(empty — add away)_

---

## Changelog
- 2026-08-02 — Added §9 Product Development. Phase 1 built on `dev`: migration 129 (9 `pd_*` tables),
  the build-sheet model, RBAC/nav/archive wiring, the ply editor + diagram, and the Rockstar seed.
  **Migration 129 is NOT applied** (keychain blocked → dashboard paste). Also closed a real leak found
  on the way: `/admin/archive` is section-less and fails open, so it listed supplier, PO and order names
  to every team member — `ArchiveEntity.section` now gates the list and the archive/restore POST.
  Deleted the `/admin/boards` and `/admin/reviews` stubs (section-less, fail-open, and `/admin/reviews`
  collided with the live `exp_reviews` API).
- 2026-06-18 — Roadmap created from current repo state.
- 2026-06-18 — Added website-behaviour analytics plan (Supabase build, both divisions).
- 2026-06-18 — Added guest galleries/share, media pipeline (videographer portal + storage/CDN),
  blog/magazine structure. ✅ Decided: shared magazine + separate `/studio` media role.
- 2026-06-18 — Decided: go live on Resend (not Mailgun). Added team roles/permissions/invites
  (owner role, self-only hours, invite panel) — shares `access_role` model with §6.
- 2026-06-18 — Decided: owner-only role mgmt + a configurable **roles × pages access matrix**
  (`/admin/access`), enforced server-side on routes + APIs. Page-level view for v1.
- 2026-06-19 — Captured Experience-side admin fixes → `ADMIN-EXPERIENCE-FIXES.md`, then upgraded
  it to a concrete implementation plan (per-item DB/API/UI/files + effort, migrations roll-up,
  execution order). Migration status: 019/020 applied, 021 pending.
- 2026-06-19 — Execution thread completed A–M. Carry-forwards: apply migration 022 (destinations);
  D financials role-gate → §8; M audit + template links separate; F +year skipped.
- 2026-06-19 — Admin fixes batch (branch `admin-experience-fixes`) — quick wins shipped:
  L WIP badges · E.1 removed AI summary from contacts · E.2 scoped hotel-room experience filter ·
  F.2 components-page experience/edition filters.
- 2026-06-19 — Admin fixes batch cont'd: A ops dashboard (+aggregator API) · E.3 new-booking modal +
  edition participant typeahead (auto-name) · J/K edition selectors on costs+hours (columns already
  existed) · B experiences detail sub-nav + "Main image" relabel · F.1 confirmed (picker already
  experience-scoped). D reframed: guides/reviews stay per-edition (coaches/program differ per week).
- 2026-06-19 — Admin fixes batch **COMPLETE** (A–M + I) → merged to `dev` (a9debc1, 17 commits).
  Added: C duplication · G Event Content tabs + per-edition module host + tile single-source ·
  M pipeline timeline · H member detail page · I Destinations (table + CRUD + bidirectional link).
  Experience + Content sub-navs converted to real section TABS (were scroll anchors). **Pending:**
  migration 022 (destinations). Deferred: finance role-gate (§8), pipeline dedup audit, public
  destination pages, edition-duplicate live test.
- 2026-06-21 — Member community profiles + trip "crew" → `docs/CREW-PROFILES-PLAN.md`. Built on
  `dev`, **not shipped**: opt-in site-wide profile (avatar from gallery, @username, level/country/
  city/age, per-surface + per-field toggles), service-role "privacy by projection" (never loosens
  contacts RLS), crew teaser merged into the trip page + `/account/bookings/[id]/crew` roster,
  spot-note bylines enriched. Migration 035 **pending**; code tolerant of it being unapplied.
  Deferred: avatar upload, public `/u/[username]` pages, review-card avatars (curation-owned).
