# Go-live readiness — design

> Researched 2026-08-02 by 10 agents against the live schema and prod data.
> NOT BUILT. ~45 checks, each with column, severity and where to fix it.
> Note: the "oversold" findings are stale `max_spots` values, not real
> overselling — Nico confirmed 2026-08-02. The check still earns its place, as a
> capacity-is-wrong warning rather than an alarm.


## 1 · PAGE OR INLINE? Both, and the page is the primary. Here is why the question has a forced answer.

**A separate page `/admin/go-live`, plus a thin panel inline on `/admin/content/[id]` and `/admin/editions/[id]`. One library, three renders — the `mailContentReady()` pattern.**

Four reasons, each grounded in code:

1. **The current widget does not run at the go-live moment.** `src/app/admin/page.tsx:576` filters to `r.nextStart || r.websiteVisible`. Every experience actually being prepared for launch — croatia, greece, maui, south-africa, september-2027, all `website_visible=false` with no dated editions — is invisible to "Before it goes public" *until it is already public*. An inline-only design repeats this: a panel you only see once you've opened the thing. A page framed as "what is ready to go live" lists the drafts first, by intended launch date.

2. **A third of the checks belong to no single edit screen.** `company_settings` (one row, `src/lib/legal.ts:30`) is simultaneously the Impressum operator, the Terms party, the Privacy controller, the waiver Organiser and the Sicherungsschein source on every invoice PDF. The anon RLS gap on `exp_package_components` is a platform fact. Missing email template keys are a registry fact. None of these has an "experience" to hang off.

3. **The unit of the decision is a trip, not an experience.** Publishing is `exp_experiences.website_visible` **and** `exp_editions.status='published'` (the true gate is already computed at `src/app/api/admin/editions/[id]/route.ts:75-83` as `public_visible`). Experience-scoped checks alone cannot say "is Alaçatı 17 Aug sellable". The page groups experience → its editions → their packages, which is the shape of the answer.

4. **But a list you cannot act on is noise.** So the inline panel exists — scoped to exactly the entity you have open, with the same rows the page shows — and every row on the page is a deep link with the tab pre-selected (`/admin/editions/{id}?tab=packages` already works, `src/app/admin/editions/[id]/page.tsx:264-269`; `/admin/content/[id]/page.tsx:80` is `useState("media")` with no URL param and needs one).

Do **not** keep the dashboard widget as a third truth. Replace `admin/page.tsx:572-610` with a 3-number summary ("Publish 9/9 · Sell 3/6 · Trip 5/5") linking to the page, and absorb `contentGaps` (`src/app/api/admin/dashboard/route.ts:128-141`) — note its hero rule (content → experience fallback, `:135`) is the **correct** one, while `experience-readiness.ts:102` is wrong, so absorb in that direction.

---

## 2 · THE CHECK CATALOGUE

Legend: **B** = blocker (publishes a false claim, takes money against something incomplete, or breaks a week). **W** = warning. Gate: `publish` / `sell` / `sellLegally` / `operate`. "Live" = how many rows fire against prod today.

### 2.1 · EXPERIENCE (`exp_experiences`, `exp_content`)

| id | Checks | Column(s) | Sev · Gate | Fix at | Live |
|---|---|---|---|---|---|
| `exp.tileImage` | Listing-tile photo present | `exp_experiences.hero_image` | **B** publish | `/admin/content/{id}` → Media → "Main image (card + hero)" (writes via `api/admin/content/[id]/route.ts:204`) | 0 |
| `exp.pageHero` | Page hero resolves | `exp_content.hero_image` ∥ `exp_experiences.hero_image` | W publish | same, → "Event hero" | 0 |
| `exp.gallery` | Own photos, not `BRAND_IMG` stock | `exp_content.gallery` ∥ `exp_experiences.gallery` | **B** at 0 · W at 1–5 · publish | Media → Gallery | 0 live, 4 drafts |
| `exp.location` | Place name set | `exp_experiences.location` | **B** publish | `/admin/experiences/{id}` | 0 |
| `exp.description` | Trip intro written | `exp_experiences.description` | W publish | `/admin/experiences/{id}` | — |
| `exp.airport` | Quick-facts airport | `exp_experiences.airport_code` | W publish | `/admin/experiences/{id}` | — |
| `exp.locationAbout` | "The spot" text (destination fallback counts) | `exp_content.location_about` ∥ `destinations.intro\|tagline` | W publish | Content → Story | keep as-is |
| `exp.weekInfo` | "Your week" paragraph | `exp_content.week_info` | W publish | Content → Story | keep |
| `exp.wind` | Wind facts | `exp_content.wind_range` ∥ `wind_probability` | W publish | Content → Story | keep |
| `exp.weekTitle` | Headline not the shared default | `exp_content.week_title` vs `DEFAULT_WEEK_TITLE` | W generic | Content → Story | works today |
| `exp.weekOutcomes` | 6 cards not the default, **scored per element** | `exp_content.week_outcomes` vs `DEFAULT_OUTCOMES` | W generic | Content → Story | **dead check** — see §4 |
| `exp.faq` | FAQ not the default, per element | `exp_content.faq` vs `DEFAULT_FAQ` | W generic | Content → FAQ | **dead check** |
| `exp.dailyProgram` | Day-by-day not the default | `exp_content.daily_program` vs `DEFAULT_DAILY_PROGRAM` | W generic | Content → Program | works (11/13 amber) |
| `exp.reviewPlaced` | ≥1 placement whose review is **approved** with a non-empty quote | `exp_review_placements` ⋈ `exp_reviews.status`, `.quote` | **B** publish | `/admin/guest-reviews` | **1 — Lake Garda is serving `MOMENTS` right now** |
| `exp.reviewDepth` | ≥3 placements | same | W publish | Guest Reviews | 0 |
| `exp.packingList` | Delegate to `MAIL_REQUIREMENTS` — do not restate | `exp_content.packing_list` | **B** operate, due start−22d | Content → Pre-trip | reuse `email/readiness.ts` |
| `exp.cancellationPolicy` | Contractual terms exist | `exp_experiences.cancellation_policy` | W sellLegally | `/admin/experiences/{id}` | **5/5 published NULL** (and read only *after* login, `account/bookings/[id]/page.tsx:126`) |
| `exp.tilePriceMatch` | Grid price = min package price | `exp_experiences.price` vs `min(exp_packages.price)` | **B** sell | `/admin/experiences/{id}` | **2 — Alaçatı +51%, Bonaire +21%** |

**Event template (`exp_experiences.page_template='event'`) — a different check set.** `applies:` predicate switches these on and suppresses `exp.gallery`/`week*`/`faq`/`pkg.*`:

| `evt.included` | ticket "what's included" | `exp_experiences.whats_included` | **B** sell | ⚠ **no admin field exists** — `api/admin/experiences/[id]/route.ts:106-108` wrongly comments it "lives on exp_editions" and omits it from `allowed`, so it is write-once-at-create. Ship the fix with the check. |
| `evt.dates` | ≥1 candidate/confirmed date | `exp_event_dates` | **B** sell | Content → Event |
| `evt.price` | `price > 0` | `exp_experiences.price` | **B** sell | `/admin/experiences/{id}` |
| `evt.headCoach` | a coach with `role ilike '%head%'` | `exp_edition_coaches` ⋈ `exp_coaches.role` | **B** publish | Content → Per-edition |
| `evt.stripePct` | deposit/refund % deliberate | `event_deposit_pct` (dflt 20), `event_refund_pct` (dflt 15) | W sell | Content → Event |

### 2.2 · EDITION (`exp_editions`)

| id | Checks | Column(s) | Sev · Gate | Fix at | Live |
|---|---|---|---|---|---|
| `ed.oversold` | secured ≤ capacity | `exp_editions.max_spots` vs `paidSpotsByEdition` (`src/lib/availability.ts:12-35`) | **B** operate | `/admin/editions/{id}?tab=details` | **2 — Alaçatı 16 vs 10 (starts in 15 days, page says "Fully booked"), Bonaire Wk II 21 vs 8. Highest-value check in the whole system.** |
| `ed.dates` | both dates set | `date_start`, `date_end` | **B** sell (only when `status='published'`) | Details | 0 published; Malmö draft has both null |
| `ed.notExpired` | `date_end >= today` while published | `date_end` | W operate | Details | 0 |
| `ed.maxSpots` | capacity set | `max_spots` | **B** sell | Details | 0 (null also kills the `/api/reserve:102` guard) |
| `ed.packages` | ≥1 package resolving here: `status='active'` ∧ `price` ∧ `website_visible` | `exp_packages` | **B** sell | `?tab=packages` | **7 draft 2027 editions have 0** |
| `ed.deposit` | explicitly set (0 counts) | `exp_editions.deposit` | W sell | Details | 0/83 (null → silent €300, `payments.ts:69`) |
| `ed.coaches` | ≥1 crew row | `exp_edition_coaches` | **B** publish | Content → Per-edition (`edition-guides-editor.tsx`) | 0 today; fires the moment Garda 2027 / Alaçatı 2027 publish → fabricated `COACHES` |
| `ed.coachPhoto` | effective portrait per coach | `image_override ?? exp_coaches.image_url` | W publish | Content → Per-edition | 0 |
| `ed.labelUnique` | unique among visible editions | `exp_editions.label` | W publish | Details | Bonaire `Week I/II/III` ×2 years |
| `ed.currency` | matches the experience (the page reads the experience's) | `exp_editions.currency` vs `exp_experiences.currency` | W sell | Details | 0 |
| `ed.roomsExist` | room-weeks ≥ secured guests needing a bed | `exp_hotel_rooms` | **B** operate, due start−21d | `/admin/hotel-rooms` | WindWeek 2027: 4 bookings, 0 rooms |
| `ed.everyGuestHasBed` | each secured booking in `booking_id` ∥ `extra_booking_ids` | `exp_hotel_rooms` | **B** operate, due start−21d | `/admin/hotel-rooms` | **Bonaire Wk I: 4 paid guests, no bed, 12 unused room-weeks** |
| `ed.roomOverlap` | no unconfirmed date collision | `exp_hotel_rooms.hotel_confirmed`, `check_in/out` | W operate | `/admin/hotel-rooms` | — |
| `ed.mail*` | packing list · pre-trip note · WhatsApp | delegate to `getEditionReadiness()` | B/W operate, `SEND_SCHEDULE` clock | Details / Content → Pre-trip | every published edition lacks WhatsApp except Alaçatı |

### 2.3 · PACKAGE (`exp_packages`)

| id | Checks | Column(s) | Sev · Gate | Fix at | Live |
|---|---|---|---|---|---|
| `pkg.included` | curated list **or** ≥1 `show_on_website` link whose component has a `description` | `exp_packages.includes` (text[]) ∥ `exp_package_components.show_on_website` ⋈ `exp_components.description` | **B** sell | `/admin/packages/{id}` → Components (Web tick) + `/admin/components` (description) | **83/83.** Every package on np-seven.com prints the hardcoded six lines from `package-picker.tsx:57-64` incl. "Breakfast every morning" / "Healthy lunch on the beach daily". ⚠ **unsatisfiable until the anon RLS policy ships — see `platform.componentRls`** |
| `pkg.hotel` | accommodation-bearing package has a hotel | `exp_packages.hotel_id` | **B** sell | ⚠ `/admin/packages` only — the **edition → Packages tab has no hotel field at all** (`admin/editions/[id]/page.tsx:539-550`), which is the root cause | **6 of 7 publicly-reachable Alaçatı packages**, 2 per Bonaire week |
| `pkg.category` | level tab is explicit, not name-scraped | `exp_packages.category` | W sell | `/admin/packages` | 17/83 (0 on upcoming published); also disarms the EN-DASH bug at `experience/[slug]/page.tsx:120-124` |
| `pkg.price` | non-null (else it silently vanishes, `page.tsx:269`) | `exp_packages.price` | W sell | `/admin/packages` | 0/83 |
| `pkg.deposit` | explicit | `exp_packages.deposit` | W sell | `/admin/packages` | 0/83 |
| `pkg.costDrift` | `cost_per_person` within €1 of Σ(`unit_cost`×`quantity`) over non-archived links | `exp_packages.cost_per_person`, `exp_components.unit_cost` | W sell (waivable) | `/admin/packages/{id}` → Components | **20/83** (SOROBON Kas Chicitu: stored €857.60 vs €0.00) |
| `pkg.archivedComponent` | no archived component linked | `exp_components.archived_at` | W sell | `/admin/components` | **16/83** ("BON - Event Shirts", €25, archived, still counting) |
| `pkg.noComponents` | any cost signal at all | `exp_package_components` count | W sell (**waivable — Alaçatı is a deliberate decision**) | `/admin/packages/{id}` | 10/83 |

### 2.4 · COMPONENT (`exp_components`)

| `cmp.webDescription` | every `show_on_website=true` link's component has a customer-safe `description` (else `description \|\| name` prints "BON - Gear Rental Wave/Freeride 6d", `page.tsx:343`) | `exp_components.description` | **B** sell | `/admin/components` | **54/60 have none**, 40 linked |
| `cmp.addon` | `addon_available` requires `sell_price` + `description` | `sell_price`, `description` | W sell | `/admin/components` | 9 of 11 add-ons undescribed |
| `cmp.paymentMode` | billed-by decided, not defaulted | `exp_components.payment_mode` (NOT NULL dflt `'np7'`), `payment_note` (mig 124) | W sell | `/admin/components` | never reviewed |

### 2.5 · HOTEL (`hotels`)

| `hotel.photo` | `image_url` set on any hotel linked from a selling package | `hotels.image_url` | W sell | `/admin/hotels` | 0/6 |
| `hotel.description` | blurb | `hotels.description` | W sell | `/admin/hotels` | 0/6 |
| `hotel.gallery` | ≥2 (the swap-thumb strip needs >1, `package-picker.tsx:277-302`) | `hotels.images` | W sell | `/admin/hotels` | **REF Carsi 0, REF Koyici 0** |
| `hotel.location` | non-empty (the Maps fallback builds a search from `name + location`, `account/bookings/[id]/page.tsx:345`) | `hotels.location` | W operate | `/admin/hotels` | 0/6 |
| `hotel.mapsUrl` | deep link | `hotels.maps_url` (mig 130) | W operate | `/admin/hotels` | **6/6 empty — migration shipped, 0% adopted** |
| `hotel.orphan` | populated hotel linked from 0 active packages — the "you built it and forgot to link it" signal, pairs with `pkg.hotel` | `hotels` ⟂ `exp_packages.hotel_id` | W sell | `/admin/packages` | 1 (Playa Surf CBbC) |

### 2.6 · DESTINATION (`destinations`) — a second full public sales page nobody had audited

| `dest.intro` | Overview + nav entry | `destinations.intro` ∥ `tagline` | W publish | `/admin/destinations/{id}` | — |
| `dest.hero` | `ParallaxHero` gets a real image, not a solid `#00374a` | `hero_image` ∥ `gallery[0]` | W publish | `/admin/destinations/{id}` | — |
| `dest.conditions` | ≥1 of the six, else the whole Conditions band vanishes (`destinations/[slug]/page.tsx:114,193`) | `wind_probability, wind_season, wind_speed, best_season, conditions, skill_levels` | W publish | `/admin/destinations/{id}` | `wind_probability` empty on lake-garda + tenerife |
| `dest.gallery` | gallery section renders | `destinations.gallery` | W publish | `/admin/destinations/{id}` | — |
| `dest.partners` | Local partners block | `destinations.partners[].image` | W publish | `/admin/destinations/{id}` | **empty on all 16** |

### 2.7 · LEGAL / COMPANY — singleton, gate `sellLegally`. No experience-scoped collector will ever load these.

| `legal.operator` | `legal_name` is the actual site operator | `company_settings(division='experience').legal_name` | **B** | `/admin/settings` | **fails — "Surfcenter Experience B.V." named as §5 TMG Diensteanbieter of www.np-seven.com, footer prints "© 2026 NP7 GmbH", and `/experience/legal/package-travel:31` says NP7 GmbH is the organiser** |
| `legal.managingDirector` | mandatory Vertretungsberechtigt block renders | `company_settings.managing_director` | **B** | `/admin/settings` | **NULL — block silently skipped, `impressum/page.tsx:36`** |
| `legal.contact` | address · email · phone · VAT/tax number | `company_settings.*` | **B** | `/admin/settings` | `website`, `tax_number` NULL |
| `legal.sicherungsschein` | insolvency protection on invoices and the Formblatt | `company_settings.sicherungsschein_insurer`, `.sicherungsschein_number` | **B** | `/admin/settings` | **both NULL** → `invoices/template.tsx:666-667` returns null on every PDF; package-travel page publicly prints `[Insurer / protector and certificate number to be inserted by NP7]` |
| `legal.waiverJurisdiction` | governing law ≠ a Dutch village | `company_settings.city` vs `DEFAULT_WAIVER` §12 (`src/lib/waiver.ts:22-23`) | **B** | `/admin/settings` | **renders "law of the Federal Republic of Germany … place of jurisdiction is Steendam"**; `exp_experiences.waiver_text` NULL on all 13 |
| `legal.draftBanners` | no live legal page carries a visible "Draft — have counsel review" `.note` callout | source strings in `terms/page.tsx:15`, `privacy/page.tsx:15`, `experience/legal/package-travel/page.tsx:26,62` | **B** | code + a `legal_reviewed_at` setting | **3 pages + 1 literal placeholder.** Cheapest high-value check in the exercise: three string constants gate the legality of every sale |
| `legal.chrome` | Impressum + Privacy linked from every public footer; cookie settings re-openable | layout property — `ocean-header.tsx:16-24` has no legal nav; all four experience-world footers carry only `/widerruf`; `cookie-consent.tsx:60-66` renders once and has no re-open entry point while `privacy:40` promises withdrawal | **B** | code | fails |
| `legal.bookingDisclosure` | Terms + §651d Formblatt linked before the booking declaration, and acceptance recorded | `reserve-modal.tsx` has none; `exp_bookings` has no `terms_accepted_at` column | **B** | code + migration | fails (contrast `hardware/checkout/page.tsx:125-133`, which does it right) |

### 2.8 · PLATFORM — one-off, evaluated once per run

| `platform.componentRls` | anon can SELECT `exp_package_components` + `exp_components` | `pg_policies` — only `is_team_member()` policies exist (`20260607_009_admin_rls.sql:56-70`) | **B** sell | a migration | **fails — this is what makes `pkg.included` unsatisfiable. Ship the policy WITH the check or it is a permanent red row.** |
| `platform.emailTemplates` | every `templateKey` code sends exists in `email_templates` AND `src/lib/email/templates.ts` | — | **B** operate | `/admin/email-templates` | **3 missing**: `event_date_confirmed_balance`, `event_date_not_running`, `hw_order_confirmation` → `renderTemplate` throws, `send.ts:104-110` returns `failed`, caller's `.catch(()=>{})` swallows it |
| `platform.lifecycleFlag` | `EMAIL_LIFECYCLE_LIVE` / `EMAIL_PIPELINE_LIVE_FROM` state, shown as info | `process.env` | W operate | Vercel | unknown from here — if unset, a deposit payer gets no confirmation mail (`deposit_confirmation` is not in `SOFT_LAUNCH_ALLOWED`) |

**Scored against this catalogue, Alaçatı 2026 shows 5 red rows today**: generic includes (7 packages, one row with a count), oversold 16/10, grid price +51%, 6 hotel-less packages, 1 secured guest without a bed. That is a checklist someone reads.

---

## 3 · THE TYPE

`src/lib/go-live/types.ts`. Keeps four things from `email/readiness.ts` — derived severity, a due date from a schedule, explicit inheritance, one module for panel + guard — and fixes the five things that don't scale.

```ts
/** Named after the consequence, like `blocks` in MAIL_REQUIREMENTS. */
export type Gate =
  | "publish"      // the public page would look unfinished or lie
  | "sell"         // you'd take money against something incomplete
  | "sellLegally"  // the sale itself is exposed (TMG/GDPR/package-travel/UWG)
  | "operate";     // the week or its mails break

export type CheckStatus =
  | "ok"
  | "missing"    // field empty
  | "generic"    // present but still the shared default — scored per element
  | "waived"     // a recorded decision (Alaçatı: no components this year)
  | "na"         // `applies` said no (event template, no-hotel package)
  | "unknown";   // not knowable yet — image dimensions, RLS probe failed

/** The row this is about. Repeats per instance, and is clickable. */
export type Subject = {
  kind:
    | "experience" | "content" | "edition" | "package" | "component"
    | "hotel" | "room" | "coach" | "destination"
    | "company" | "legalDoc" | "emailTemplate" | "platform";
  id: string;                 // uuid, or a stable slug for singletons
  label: string;              // "Advanced – Superior Room · Alaçatı 2026"
  href: string;               // deep link WITH the tab: /admin/editions/x?tab=packages
};

export type Milestone =
  | { at: "publish" }                        // before website_visible flips
  | { at: "sell" }                           // before the first booking
  | { at: "daysBeforeStart"; days: number }; // the SEND_SCHEDULE clock

export type GoLiveCheck = {
  id: string;                 // stable slug: "pkg.included", "legal.sicherungsschein"
  label: string;
  subject: Subject;
  status: CheckStatus;
  /** the count/quantifier that makes it actionable: "0 of 8 packages have components" */
  detail?: string;
  /** generic scored per element: 4 of 6 FAQ entries untouched */
  progress?: { done: number; total: number };
  gate: Gate | null;          // null === the mail model's `soft`
  breaks: string[];           // ["Booking step", "Invoice PDF"] — the `blocks` idea
  source?: "edition" | "experience" | "destination" | null; // resolveEditionContent
  dueBy: Milestone | null;
  dueDate: string | null; daysLeft: number | null; overdue: boolean;
  waiver?: { reason: string; by: string; at: string };
  /** the check cannot pass until a code/migration change lands — render grey, not red */
  requires?: string;          // "anon SELECT policy on exp_package_components"
};

export type GoLiveReport = {
  scope: Subject;
  checks: GoLiveCheck[];
  byGate: Record<Gate, { done: number; total: number; blocking: number }>;
  ready: Record<Gate, boolean>;
  score: { done: number; total: number };   // COMPUTED — never a literal like :126
};

/** The declarative registry — the MAIL_REQUIREMENTS analogue. */
export type CheckDef<E = unknown> = {
  id: string; label: string;
  scope: Subject["kind"];
  gate: Gate | null;
  breaks: string[];
  dueBy: Milestone | null;
  requires?: string;
  /** false ⇒ status "na". Event template, no-hotel package, unpublished edition. */
  applies?: (ctx: GoLiveContext, entity: E) => boolean;
  /** PURE over a pre-batched context. No I/O — N packages cost 0 queries. */
  run: (ctx: GoLiveContext, entity: E) =>
    { status: Exclude<CheckStatus, "waived" | "na">; detail?: string; progress?: GoLiveCheck["progress"] };
  subject: (ctx: GoLiveContext, entity: E) => Subject;
};

/** The mailContentReady() analogue — what the publish toggle calls. */
export function canPass(r: GoLiveReport, gate: Gate):
  | { ok: true }
  | { ok: false; blocked: GoLiveCheck[] };
```

Three deletions from the old model, each load-bearing:
- **the `missing[]` / `generic[]` two-array split** (`experience-readiness.ts:39-40`) → one list with `status`. That split is why `total` had to be the literal `11` at `:126` and hardcoded again in the subtitle at `admin/page.tsx:583`, and why commit `a9fbc92` had to patch an "unexplained 7/11".
- **`key: ContentKey` as a closed union with a static label `Record`** → go-live checks repeat per instance; `pkg.included` is 8 rows for Alaçatı.
- **`where` as prose** → `Subject.href`. Fine for 3 fixed spots, useless at 40 rows.

**Waivers need a table**, not an optional field, or Nico's deliberate no-components decision makes the list permanently red — exactly the failure `admin/page.tsx:572-574` already warns about:

```sql
create table go_live_waivers (
  id uuid primary key default gen_random_uuid(),
  check_id text not null,
  subject_kind text not null,
  subject_id uuid not null,
  reason text not null,
  waived_by text not null,
  waived_at timestamptz not null default now(),
  expires_at date,               -- "this season only" — Alaçatı 2026, not 2027
  unique (check_id, subject_kind, subject_id)
);
```

---

## 4 · HOW IT COMPUTES

**One library, `src/lib/go-live/`:**

```
types.ts       the shapes above
registry.ts    CheckDef[] — the catalogue in §2, one entry each
collect.ts     ONE batched pass → GoLiveContext
run.ts         pure evaluation + waiver overlay + score
normalize.ts   the fixed default comparator
probe.ts       the two things a DB read can't answer (anon RLS, env)
gate.ts        canPass()
```

**`collect(scope)` does one `Promise.all`**, the style of `experience-readiness.ts:70-74`, then every `CheckDef.run` is pure. Never `getEditionReadiness`-per-row like `api/admin/mail-gaps/route.ts:26-38`, which is N round-trips per dashboard paint. ~14 queries total: `exp_experiences`, `exp_content`, `exp_editions`, `exp_packages`, `exp_package_components`⋈`exp_components`, `hotels`, `exp_hotel_rooms`, `exp_rooms`, `exp_edition_coaches`⋈`exp_coaches`, `exp_review_placements`⋈`exp_reviews`, `destinations`, `exp_bookings` (for `paidSpotsByEdition`), `company_settings`, `go_live_waivers`.

**Called from:**
- `GET /api/admin/go-live?scope=all|experience:{id}|edition:{id}` — the page and both inline panels.
- `src/app/api/admin/dashboard/route.ts` — replaces the `getExperienceReadiness()` call at `:151-152` **and** the `contentGaps` block at `:128-141`. Keep the `try/catch` — a checklist must never fail the dashboard.
- **Enforcement, which is what stops this being a fourth advisory widget.** `mailContentReady()` works because the cron calls it. The publish analogue needs two named call sites:
  - `PATCH /api/admin/experiences/[id]` when `website_visible` flips to true (`route.ts:108-118`) → `canPass(report, "publish")` and `canPass(report, "sellLegally")`.
  - `PATCH /api/admin/editions/[id]` when `status` → `'published'` → `canPass(report, "sell")`.
  - Semantics: **409 with the blocked list, overridable with `?force=1`, which writes a `go_live_waivers` row naming the person.** Not a hard block — Nico must always be able to publish — but the override is recorded, which is the whole point.

**The comparator has to be rewritten, and a seed migration would not help.** The header at `experience-defaults.ts:9-13` claims the defaults "are now seeded"; they are — all 13 experiences have an `exp_content` row with the full six outcomes. The failure is that **Postgres jsonb canonicalises object key order on storage**: seeded `{icon,t,d}` comes back `{"d","t","icon"}`, seeded `{q,a}` comes back `{"a","q"}`. `sameAsDefault` (`experience-defaults.ts:62-68`) is raw `JSON.stringify` byte equality, so it never matches. Two checks are permanently false-negative (`week_outcomes`, `faq`); `daily_program` works only by luck (`DEFAULT_DAILY_PROGRAM` uses `{title,description}`, whose jsonb order happens to match). `normalize.ts`:

```ts
// recursively sort keys, drop null/undefined/"" , trim strings, then compare
export function canonical(v: unknown): unknown;
// per-element: how many entries still equal their default counterpart
export function genericScore(value: unknown[], def: unknown[]): { done: number; total: number };
```

Note the page's own constants are a **different shape** from the defaults module — `page.tsx` `ITINERARY` is `{eyebrow,title,content}`, `FAQ` is `{title,content}`, `METHOD` is `{n,t,d}`. Only `OUTCOMES` and the week-title string are literally identical. So compare against `experience-defaults.ts`, never against the page constants, and delete the page duplicates as the fallbacks are replaced.

**What cannot be answered from the DB:**

1. **Image dimensions — nothing stores them, anywhere.** A regex scan of every row of `information_schema.columns` for `width|height|px|dimension` returns three hits, all product-dev (`pd_layup_plies.width_mm`, `pd_molds.key_dimension_*`). So `exp.tileImage` can check presence but not "800×400 on a full-bleed hero". Handle in three moves, none blocking slice 1: (a) **persist at upload** — `src/lib/image-resize.ts:20-21` already computes `meta.width/height` from `sharp().metadata()` on every upload and throws them away; return them and write an `exp_media` row (`url pk, width, height, bytes, checked_at`), and/or pass them as an S3 `Metadata:` map in `uploadToR2` (`src/lib/r2.ts:80-90`, which today sends only `ContentType` + `CacheControl`); (b) **backfill** the ~879 R2 files with a cron doing `Range: bytes=0-65535` + `sharp(buf,{failOn:"none"}).metadata()` — JPEG/PNG/WebP carry dimensions in the first KB, so ~64 KB per file instead of ~2 MB; (c) until then the check reports `status:"unknown"`, never red. The only shipped precedent for warning on this is `admin/blog/[id]/page.tsx:322-338` (`naturalWidth`/`naturalHeight` → "⚠ 47% cut off at 16:9") — copy it into `ImagePickerModal`, which already decodes the bitmap at `:66`. Also **declare `sharp` in `package.json`** — `image-resize.ts:1` resolves it transitively via `next`, and a Next upgrade that relocates it 500s every upload route at module load, outside the try/catch. (The 800px files exist because the client shrink ladder at `image-picker-modal.tsx:98` bottoms out at 800.)
2. **Anon RLS reachability** (`platform.componentRls`) — must be probed with a **second Supabase client using the anon key**, server-side, `select('id').limit(1)` on `exp_package_components`. The admin client will always succeed. Cache per deploy.
3. **Legal draft banners and footer/chrome links** — source strings and layout properties, not rows. Implement as a vitest assertion in CI (grep for the `.note` draft markers, for `[Insurer` , and for an Impressum link in each footer) that writes a `settings` row the checker reads. Same for `legal.bookingDisclosure` until `exp_bookings.terms_accepted_at` exists.
4. **Env flags** — `process.env.EMAIL_LIFECYCLE_LIVE`, `EMAIL_PIPELINE_LIVE_FROM`, `SHOW_EXPERIENCE`. Read server-side only, rendered as info.
5. **"Is this photo raw or already branded?"** (`tile_auto` pairing) — human judgement. Not checkable, not a check.

---

## 5 · WHAT NOT TO CHECK

**Dead columns.** Scoring a field nothing reads is how a checklist loses trust. `exp_packages.max_spots` (80/83 null, written by both admin forms, read by no public or capacity path — all availability is `exp_editions.max_spots` via `availability.ts:12-35`). `exp_package_rooms` (3 rows, 1 of 78 packages; the "availability derives from rooms" comment at `20260712_090:8` was never built). `exp_editions.active` (`experience/page.tsx:94` selects it, `:58-63` never uses it). `exp_editions.price_from` / `price_to` / `spots_taken`. `exp_experiences.timezone` (values are wrong anyway — Alaçatı and Bonaire both `Europe/Berlin`), `.hotel` (text), `.hotels` (text[]), `.notes`. **Either wire them or delete them from the forms** — do not nag about them.

**Anything at 0 occurrences whose real fix is one line of code.** Each of these is a query or guard change, not a checklist row:
- `sticky-cta.tsx:52-54` prints `priceFrom ?? 0` → **"from €0"**. Add the null guard; never check it.
- `experience/[slug]/page.tsx:277` fetches `hotels` with no `archived_at` filter; same at `destinations/[slug]/page.tsx:73`. Add `.is("archived_at", null)`. (The one archived hotel is named "Alacati" and no package name contains that string, so the fuzzy matcher never hits it — latent, not live.)
- `destinations/[slug]/page.tsx:50` filters trips on `status='published'` only → `/destinations/emerald-sea` publicly advertises `np7-mauritius-madagascar-experience` (`website_visible=false`) and the click **404s**. Add `.neq("website_visible", false)`.
- `experience/[slug]/page.tsx:251` — `(!date_end || date_end >= today)` means a published edition with a null `date_end` never expires. Fix the predicate.
- `page.tsx:120-124` splits on **EN DASH** U+2013 while stripping on ASCII hyphen. Real bug, currently harmless (the 4 packages that hit the trap are genuinely hotel-less, and the misleading "you sort your own stay" subtitle at `package-picker.tsx:250` is gated on `g.key === '__none'` alone, not on a missing hotel). Fix the regex.
- `api/register/route.ts:110` writes `marketing_opt_in: true` without `marketing_opt_in_at`, which exists. One field.
- `api/register/route.ts:100-104` matches an existing contact by `.ilike('email', …)` unauthenticated and flips `marketing_opt_in` on **that** contact — a third party can grant consent on someone else's record. Fix, don't check.

**The fabricated fallbacks — delete them rather than checking for them.** `MOMENTS` (`page.tsx:77-81`, three invented testimonials with names and countries under a hardcoded `★ 5.0`) and `COACHES` (`:71-75`, two invented staff members with bios under "Learn from the best"). A fallback that cannot lie beats a check that says don't publish. Keep `exp.reviewPlaced` / `ed.coaches` as the belt; the deletion is the braces. Same for `BRAND_IMG` (`:35-41`) filling six epic-week panels with Bonaire photos on a Greece page — replace with an honest empty state, then the check only needs to be a warning.

**The NP7 method** — same on every trip on purpose. `experience-readiness.ts:25-27` already excludes it. Keep excluding it.

**`exp_editions.daily_program`** — an opt-in per-week override (the admin hint at `content/[id]/page.tsx:527` says "switch this on only for a week that genuinely differs"). Absence is the normal state.

**Blockers that fire on 0 rows.** `pkg.price` non-null, `pkg.deposit` non-null, `hotel.photo`, `hotel.description`, `ed.dates`, `ed.maxSpots`, `archived_at is null while published` — all clean across all 83 packages / 6 hotels / every published edition. Ship them as warnings, or gate them behind `status='published'` so they only appear on rows that can actually hurt. A permanently-green blocker is a row nobody reads.

**Ship `week_outcomes` / `faq` amber, not red.** The moment the comparator is fixed they go generic on 11 of 13 experiences **at once**. Red on day one and the new widget is noise before anyone trusts it.

**Room capacity is not a publish gate.** `ed.roomsExist` / `ed.everyGuestHasBed` are `operate`, due start−21d. Keep them out of "Before it goes public" entirely — they belong in a separate ops lane on the same page.

---

## 6 · BUILD ORDER

**Slice 0 — clear the ground (½ day).** Fix the create-package `slug` bug: `exp_packages.slug` is `text NOT NULL` with no column default and `pg_trigger` on the table is empty; `POST /api/admin/packages` (`route.ts:80-99`) inserts the body verbatim, neither form sends `slug` (`admin/packages/page.tsx:259-275`, `admin/editions/[id]/page.tsx:539-550`), and neither `save()` checks the response — the modal closes as if it worked. **Verify with one manual "New package" click first.** Also: the seven one-line fixes from §5, delete `MOMENTS` + `COACHES`, and fix `duplicate/route.ts:52-60` which drops `show_on_website` when rolling editions forward. Nothing downstream is worth building until package creation works.

**Slice 1 — the library + the page (2–3 days).** `types.ts`, `registry.ts` with §2.1 + §2.2 only, `collect.ts` (one batched pass), `run.ts`, and the rewritten `normalize.ts`. New route `GET /api/admin/go-live`, new page `/admin/go-live` grouped experience → editions, sorted by `date_start`, **including drafts** (this is the fix for `admin/page.tsx:576`). Replace the dashboard widget at `admin/page.tsx:572-610` with a three-number summary and absorb `contentGaps`. Independently useful the day it ships: it surfaces the Alaçatı oversell and the grid-price gap.

**Slice 2 — packages, hotels, components + the RLS migration (1–2 days).** §2.3–§2.5, shipped **together with** the anon SELECT policy on `exp_package_components` and `exp_components` (`20260607_009_admin_rls.sql:56-70` has team-only policies). Without the policy, `pkg.included` is a permanent unsatisfiable red row on 83 packages. Add the hotel field to the edition → Packages tab (`admin/editions/[id]/page.tsx:539-550`) in the same slice — it is the root cause of `pkg.hotel`, not a symptom.

**Slice 3 — inline panels (1 day).** The same component on `/admin/content/[id]` (which has **no** checklist today) and `/admin/editions/[id]?tab=details`, beside the existing `public_visible` pill and `MailReadiness`. Requires adding `?tab=` support to `content/[id]/page.tsx:80` so page rows can deep-link to the right tab.

**Slice 4 — waivers (1 day).** The `go_live_waivers` table, the overlay in `run.ts`, and a "Not doing this — why?" control on each row. Without it, Alaçatı's deliberate no-components decision keeps the list red forever.

**Slice 5 — enforcement (1 day).** `canPass()` wired into the two PATCH routes with 409 + `?force=1` → auto-waiver. This is what makes it a gate instead of the fourth advisory widget.

**Slice 6 — legal & platform (2 days).** §2.7 + §2.8. `company_settings` checks are a half-day; the CI assertions for draft banners, footer legal links and cookie re-open are the rest. Highest business risk in the catalogue, lowest technical difficulty — three string constants and one settings row. Can run in parallel with slices 1–5; it shares only the registry.

**Slice 7 — media dimensions (1–2 days).** Declare `sharp` in `package.json`; return `meta.width/height` from `image-resize.ts:20-21` and persist them; add `Metadata` to `uploadToR2`; the Range-read backfill cron; the resolution warning in `ImagePickerModal` modelled on `admin/blog/[id]/page.tsx:322-338`. Upgrades `exp.tileImage`/`exp.gallery` from `unknown` to a real "TOO SMALL" status. Deliberately last — nothing else depends on it.

**Files that change most:** `src/lib/experience-readiness.ts` (absorbed and deleted), `src/lib/experience-defaults.ts:62-68` (comparator), `src/app/api/admin/dashboard/route.ts:128-152`, `src/app/admin/page.tsx:572-610`, `src/app/api/admin/experiences/[id]/route.ts:108-118`, `src/app/api/admin/editions/[id]/route.ts`, `src/app/experience/[slug]/page.tsx:35-90` (fallback deletions), `src/components/experience/package-picker.tsx:57-64`, `supabase/migrations/` (anon component policy, `go_live_waivers`, `exp_bookings.terms_accepted_at`).