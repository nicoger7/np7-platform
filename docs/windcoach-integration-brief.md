# NP7 × wind.coach — Integration Brief & Build Plan

*For: Enrico (wind.coach) and his Claude · From: Nico / NP7 platform · 2026-08-10 · v1*

---

## 1 · Why we're doing this

**The product story.** An NP7 Experience week ends with video analysis and a coach
debrief. Today that knowledge leaves as a PDF that Nico emails by hand — and then
it's gone. The promise we want to sell on every experience page is *"you know what
to work on for a whole year"*. wind.coach is the tool that makes that promise true:
the guide's focus points land in the rider's wind.coach account, and their next
video session picks up exactly where the week left off.

**What NP7 gets.** A "what you take home" benefit no competitor has; zero manual
PDF shuffling; a member area that stays alive after the trip (retention, rebooking);
video-verified progress feeding the NP7 rank ladder.

**What wind.coach gets.** A funnel of exactly-right users: riders who just paid for
a coaching week, arriving with a pre-filled account, two focus points, and a coach
relationship already warm. Every NP7 participant is a conversion candidate with the
friction removed — one click, not a signup form.

**The principle both sides keep:** each platform stays the source of truth for what
it owns. NP7 owns bookings, trips and the NP7 rank ladder. wind.coach owns video
analysis, its guides and video-verified skills. Nothing is migrated; facts are
*shared, by consent, per rider*.

---

## 2 · The phases (build in this order)

### Phase 1 — Guide handoff (wind.coach → NP7) · smallest, do first
When a participant's guide is generated in wind.coach, push it to NP7 instead of
emailing a PDF around.

- wind.coach calls `POST https://www.np-seven.com/api/windcoach/guide` (endpoint to
  be built NP7-side) with the payload in §3.
- NP7 stores it against the booking, shows it on the member trip page
  ("Your focus points" card + PDF download), and triggers the existing post-trip
  email flow with a "See your focus points" CTA.
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
2. **Storage:** additive on both sides — `profiles.np7_user_id` (or a
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
      { "key": "harness", "title": "Harness timing", "summary": "…2–3 sentences…" },
      { "key": "pro_powerjibe", "title": "Jibe exit speed", "summary": "…" }
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
- Retries: at-least-once with the idempotency key; NP7 answers 409 on replays.

**Phase 2 sketch (for sizing, not final):** link codes: 6 digits, 10-minute TTL,
single use, rate-limited; server-to-server verify endpoints on both sides,
secret-authed like the §3 webhook.

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
