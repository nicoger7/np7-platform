# NP7 × wind.coach — Integration Brief & Build Plan

*For: Enrico (wind.coach) and his Claude · From: Nico / NP7 platform · 2026-08-10 · v1*

---

## 1 · What this is

We connect our two products. An NP7 week ends with video analysis and two focus
points; wind.coach is where a rider works on exactly that for the rest of the
year. Today the guide leaves as a PDF Nico emails by hand, and the platforms
don't know each other.

After this: the guide lands in the rider's NP7 member area automatically, and
from there it's one click into a wind.coach training plan. wind.coach gets every
NP7 participant as a warm, pre-filled signup right after a paid coaching week;
NP7 gets a real "you know what to work on for a whole year" and a member area
that stays alive after the trip. Later, video-verified skills flow back into NP7
progress — one more reason for participants to stay on wind.coach.

**One principle:** each platform stays source of truth for what it owns. NP7
owns bookings, trips and the NP7 ladder; wind.coach owns video analysis, guides
and verified skills. Nothing migrates — facts are shared per rider, by consent.

---

## 2 · The phases (build in this order)

### Phase 1 — Guide handoff (wind.coach → NP7) · smallest, do first
When a participant's guide is generated in wind.coach, push it to NP7 instead of
emailing a PDF around.

- wind.coach calls `POST https://www.np-seven.com/api/windcoach/guide` (endpoint to
  be built NP7-side) with the payload in §3.
- NP7 stores it against the booking and renders it as a **native guide page in
  NP7's signature design** inside the member area (trip page → "Your focus
  points" card → full guide page: hero, one card per focus point with its
  what-to-do / how / why / common-mistakes / coach-tip blocks, coach note,
  images). The **PDF is the download button on that page**, not the experience
  itself. The post-trip email CTA links to the page.
- **Matching:** by `email` (lowercased) + edition window. Ambiguity → row lands in
  an NP7 admin review queue, never guessed.
- No accounts are linked in this phase. It replaces a manual email, nothing more.

### Phase 2 — Account connection (the foundation the rest stands on)
Two paths, both ending in one row in a `linked_accounts` table on each side:

1. **"Connect your accounts" (link code) — the primary path.** Rider clicks in
   either app → 6-digit short-lived code shown in app A → typed into app B →
   server-to-server verify → linked. *(Recon: wind.coach runs Supabase Auth with
   Google/Facebook only; Supabase does not accept a custom OIDC IdP outside its
   built-in list, so "Log in with NP7" as a real provider is not a wind.coach
   code change — parked. No code-redemption plumbing exists yet on either side;
   both build it fresh against the same contract.)*
2. **"Log in with NP7" — not dead, just not an IdP.** Supabase's provider list
   is closed, but the BUTTON is buildable as a trusted bridge: the rider clicks
   "Log in with NP7" on wind.coach → NP7 authenticates them (magic link — NP7
   has no passwords) → NP7 calls a signed server-to-server endpoint on
   wind.coach → wind.coach finds-or-creates the Supabase user for that verified
   email via its admin API, generates a Supabase magic link server-side, and
   302s the rider straight into a session. One click, no password, no email
   round-trip — to the rider it IS "Log in with NP7". Same trust anchor as the
   §3 webhook (shared secret + HMAC), ~a day each side. Build it after the
   link-code flow proves the plumbing.
3. **Storage:** additive on both sides — `profiles.np7_user_id` (or a
   `linked_accounts` table) on wind.coach; the mirror column on NP7. wind.coach's
   `profiles` has no external-identity column today, so this is a clean add.

Consent screen at link time states exactly what flows (§4). Either side can unlink;
unlink propagates.

### Phase 3 — One-click "keep learning"
The trip-page focus-points card (Phase 1) gets the button: **"Continue in
wind.coach"**. Linked account → focus points are written into the rider's
wind.coach plan server-to-server, and the button deep-links straight into the app.
No account yet → the button runs Phase 2's flow first, then imports. This is the
conversion moment — one click from "my week" to "my training plan".

### Phase 4 — Progress & milestone sharing (two-way)
- **NP7 → wind.coach:** the NP7 milestone catalogue (stable `key`s — already agreed,
  never rename them) with the rider's current state. NP7 ranks have priority: they
  must exist in wind.coach's model, mapped by `key`, not by name.
- **wind.coach → NP7:** video-verified skill confirmations
  (`{np7_milestone_key, verified_at, evidence_url}`) → NP7 marks the milestone
  coach-verified (GOLD path). This needs the one wind.coach UI piece in this whole
  plan: **a dead-simple "mark skill verified" control in the video-analysis admin**
  — one search box (rider), one dropdown (skill), one button.

### Phase 5 — Full profile sharing · PARKED as draft
Levels, AI profile, gear preferences → NP7 recommends the right board/fin;
wind.coach gets gear context for coaching. Explicitly out of scope now; the consent
model in §4 is designed so this can be added later as a new scope without touching
Phases 1–4.

---

## 3 · Technical contract (Phase 1, concrete)

```
POST /api/windcoach/guide
Headers:
  X-WindCoach-Signature: hex(hmac_sha256(WINDCOACH_WEBHOOK_SECRET, raw_body))
  Content-Type: application/json
Body:
{
  "idempotency_key": "guide_<windcoach-guide-id>",
  "participant": { "email": "rider@example.com", "name": "Full Name" },
  "trip": { "label": "Alacati 2026", "start": "2026-08-17", "end": "2026-08-23" },
  "guide": {
    "pdf_url": "https://…signed, ≥30d expiry…",
    "focus_points": [
      {
        "key": "harness",
        "title": "Harness timing",
        "summary": "…2–3 sentences for list views…",
        "blocks": [
          { "kind": "what_to_do", "text": "…" },
          { "kind": "how", "text": "…" },
          { "kind": "why", "text": "…" },
          { "kind": "common_mistakes", "text": "…" },
          { "kind": "coach_tip", "text": "…" }
        ],
        "image_urls": ["https://…stable/public…"]
      },
      { "key": "pro_powerjibe", "title": "Jibe exit speed", "summary": "…", "blocks": [] }
    ],
    "coach_note": "optional free text",
    "generated_at": "2026-08-24T10:00:00Z"
  }
}
Responses: 200 {status:"stored"|"queued_for_review"} · 401 bad signature ·
409 duplicate idempotency_key (safe to ignore) · 422 schema problem (named field)
```

- `WINDCOACH_WEBHOOK_SECRET` already exists as an env name on the NP7 side (unset
  today) — Nico sets it in Vercel, Enrico stores the same value; rotate by
  overlap (accept old+new for 48h).
- **PDF handling (settled by recon):** wind.coach guides are generated on demand
  and never persisted, and R2/SigV4 presigned URLs cap at 7 days — so **NP7
  mirrors the PDF into its own R2 on receipt** (`pdf_url` only needs to survive
  the webhook call; a public-bucket URL also works). The `focus_points` in the
  payload map 1:1 from wind.coach's in-memory `GuideModel.cards[]`
  (id/title/blocks), which exists fully structured right before the PDF renders
  — the webhook is one fire-and-forget POST at that seam (the generate route's
  120s budget is already tight, so never block on NP7's response).
- `focus_points[].key` SHOULD be an NP7 milestone key when one fits (that's what
  makes Phase 4 free later); unknown keys are stored verbatim and displayed anyway.
- **`blocks` carry the full guide content** — they map 1:1 from `GuideModel.cards[]
  .blocks` (the same structures the PDF renders). This is what lets NP7 show the
  guide as a real page in its own design instead of an embedded PDF; NP7 mirrors
  `image_urls` alongside the PDF. Send the whole model — rendering decisions
  belong to the renderer.
- Retries: at-least-once with the idempotency key; NP7 answers 409 on replays.

**Phase 2 sketch (for sizing, not final):** link codes: 6 digits, 10-minute TTL,
single use, rate-limited; server-to-server verify endpoints on both sides,
secret-authed like the §3 webhook.

**Phase 4 contract (concrete, same auth as §3):**

```
GET  https://www.np-seven.com/api/windcoach/milestones
  → { milestones: [{ key, title, rank, discipline_hint }] }   // the NP7 catalogue; keys are STABLE
POST https://www.np-seven.com/api/windcoach/progress
  { "idempotency_key": "verify_<windcoach-event-id>",
    "np7_user_id": "…",                 // from the Phase-2 link
    "np7_milestone_key": "pro_powerjibe",
    "verified_at": "2026-09-01T12:00:00Z",
    "evidence_url": "https://…video…" } // optional
  → NP7 marks the milestone coach-verified (GOLD path)
```

wind.coach side: a `np7_milestone_map` (np7_key → fp_id + discipline) table —
additive next to the free-text `fp_id` the training plan already uses — and the
one-search-box "mark skill verified" control in the video-analysis admin that
fires the POST. NP7 keys never rename; unknown keys are rejected with a 422
naming the key, so a mapping typo surfaces immediately instead of dropping
progress on the floor.

---

## 4 · Safe & legal (the frame, before any code)

- **Roles:** separate controllers, not joint. Each side is controller of its own
  platform; for shared data the receiving side becomes controller for its purpose.
  A short **data-sharing agreement** (not a full DPA) between NP7 GmbH and the
  wind.coach entity names: categories shared, purposes, retention, deletion duty.
  One page is enough if it's precise. Lawyer-review alongside the Sicherungsschein
  work that's already running.
- **Consent, per scope, at link time:** Phase 1 needs none beyond the existing
  coaching contract (the guide is part of the paid service — legitimate
  performance of contract; state it in the NP7 privacy policy). Phases 2–4 are
  consent-based: the connect screen lists exactly what flows in plain words, one
  checkbox per direction. Phase 5 would be a NEW scope with its own checkbox —
  never bundled.
- **Data minimisation:** email + name + the guide. No booking prices, no health
  data, no marketing lists. wind.coach must not email NP7-sourced contacts for
  marketing without its own opt-in (this goes in the agreement).
- **Deletion:** unlink or account deletion on either side → webhook to the other
  side → shared rows deleted, log kept 30 days. Both sides EU-hosted (confirm
  wind.coach hosting region in the agreement).

---

## 5 · Who builds what

| # | Piece | Side | Size |
|---|---|---|---|
| 1 | `POST /api/windcoach/guide` + storage + review queue | NP7 | S |
| 2 | Trip-page "Your focus points" card + post-trip email CTA | NP7 | S |
| 3 | Guide push on generation (webhook + retry + idempotency) | wind.coach | S |
| 4 | Link-code flow + `linked_accounts` (both sides) | both | M |
| 5 | "Log in with NP7" (token verify endpoint NP7, provider wind.coach) | both | M |
| 6 | "Continue in wind.coach" import + deep link | wind.coach | M |
| 7 | Milestone catalogue export + verified-skill webhook | both | M |
| 8 | Video-analysis admin: "mark skill verified" control | wind.coach | S |
| 9 | Data-sharing agreement + privacy-policy paragraphs | Nico + lawyer | S |

**Sequencing:** 1–3 ship alone and already kill the manual PDF work. 4–6 are the
conversion funnel. 7–8 are the retention loop. 9 starts now, in parallel.

**For Enrico's Claude:** everything it needs is this document plus the payload
schema in §3. NP7-side code lives in `np7-platform` (Next.js App Router +
Supabase); the NP7 endpoints in rows 1 and 5 are built by NP7's side, so
wind.coach's work never requires reading NP7's codebase — the contract in §3 is
the whole interface. Test vectors: send the §3 example with the shared secret
against the NP7 staging URL; expect `queued_for_review` (the example email won't
match a booking).

---

## 6 · The five questions — answered from the wind.coach codebase (read-only recon, 2026-08-10)

1. **Guide generation is a manual admin export today** (`/admin/guides` → POST
   `/api/admin/training-guide/generate` → browser download; nothing persisted).
   The structured `GuideModel` exists in memory right before the PDF renders —
   the webhook is a one-call, fire-and-forget insert at that exact seam. The
   `notifyAdmin()` AdminEvent union is the codebase's natural outgoing-event
   pattern to extend.
2. **No skills table.** Progress lives in `training_plan_items` with free-text
   `fp_id` (book taxonomy: `"1.1.3.2"` fin / `"w1.1.1"` wing / `"f2.2.5"` foil)
   + `discipline`; milestones/badges are computed, not stored. NP7 keys need a
   small **mapping table (np7_key → fp_id + discipline)** on the wind.coach side
   — additive, no migration of existing data.
3. **EU throughout:** Supabase Frankfurt, PostHog Frankfurt, Resend Ireland,
   R2 Eastern Europe; deployed on Vercel Pro. **Entity for the agreement:
   Marotti windsurfing d.o.o., Ulica Andrije Štangera 25, 51410 Opatija,
   Croatia — OIB 34138224299, EU VAT HR34138224299.**
4. **Link-code only.** wind.coach is Supabase Auth (email + Google/Facebook);
   Supabase takes no custom OIDC IdP, so "Log in with NP7" is parked. No
   redemption plumbing exists yet on either side; `profiles` has no external-id
   column — `np7_user_id` is a clean additive change.
5. **Signed URLs cap at 7 days** (SigV4/R2) — NP7 mirrors the PDF on receipt;
   already folded into §3.

**Still genuinely open for Enrico:** none technical — just the go-ahead, and the
data-sharing agreement signature (§4).
