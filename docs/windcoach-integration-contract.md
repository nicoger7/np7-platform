# NP7 ↔ wind.coach — the integration contract

*For Enrico and whoever builds the wind.coach side. Written 2026-08-28.*

This is the reference so the two sides can build without messaging each other.
If something here is wrong or missing, that is a bug in this file — say so.

---

## What exists today (live on production)

**`POST https://www.np-seven.com/api/windcoach/guide`** — wind.coach pushes a
rider's training guide into NP7.

- Auth: `x-windcoach-signature` = HMAC-SHA256 of the **raw request body**, hex,
  keyed with the shared secret. The signature is checked against the raw text,
  so parse-then-restringify will break a perfectly valid payload.
- Idempotent on `idempotency_key`. At-least-once delivery is expected.

Responses, exactly:

| Code | Body | Meaning |
|---|---|---|
| 200 | `{"status":"stored"}` | matched to a booking |
| 200 | `{"status":"queued_for_review"}` | not unambiguously matchable — a human attaches it |
| 401 | | bad signature, or no secret configured |
| 409 | `{"status":…,"duplicate":true}` | this `idempotency_key` already landed |
| 422 | `{"error":"field: why"}` | schema problem, offending field named |

Eight contract tests pin this. It will not change without notice.

**`POST /api/webhooks/windcoach`** — skill verification. `Authorization: Bearer
<secret>`. Marks a milestone `verified_via = 'windcoach'`. A coach's own
verification always outranks it and is never downgraded.

### Payload tolerances that will NOT tighten

- `guide.pdf_url` may be absent or present.
- `focus_points[].image_urls` may be empty or filled.
- Block `kind` values NP7 does not recognise still render — new kinds must never
  silently disappear.
- `focus_points[].key` is wind.coach's book id. NP7 stores and displays it
  **verbatim**, never normalised. Send `"1.1.3.2"`, `"w1.1.1"`, `"f2.2.5"` as
  they are.

### How a guide finds its rider today

Email → contact → that contact's bookings whose **edition window overlaps**
`trip.start`–`trip.end`. Exactly one hit stores it; zero or two or more park it
in a review queue at `/admin/windcoach-guides` for a human. Matching is never
guessed.

---

## Agreed, built, NOT yet on production

Waiting on Nico's go. Shipping to production is deliberate — see *Why there is
no staging* below.

**`GET /api/windcoach/trips`** — the weeks a coach can pick from.
`Authorization: Bearer <secret>`, server-to-server only.

```json
{ "trips": [ { "id": "…", "label": "NP7 Experience Alaçatı — Week I",
               "start": "2026-08-17", "end": "2026-08-23", "kind": "trip" } ] }
```

Bounded to roughly the last 180 and next 60 days, and draft/archived weeks are
excluded — a guide is written *after* a week, so the future window is short and
NP7's unannounced season calendar is not the partner's business. `kind` lets you
hide 1–2 day events from a guide picker.

**`GET /api/windcoach/trips/{id}/riders`** — who was on that week.

```json
{ "riders": [ { "booking_id": "…", "name": "Andreas Burmeister" } ] }
```

Deliberately minimal: **no email addresses, no contact details, no money.**
Lost and lead bookings are excluded. `booking_id` is all you need.

**`booking_id` on the guide push.** The rule:

> **booking_id XOR email — at least one is required, and booking_id wins when
> both are present.**

With a `booking_id` there is nothing to match: NP7 stores the guide against that
booking directly and resolves the contact's email itself, so wind.coach never
has to hold a rider's address. Existing email-only payloads stay valid
unchanged. A stale `booking_id` *with* an email falls back to the old matching
rather than losing the guide; a stale one *without* an email returns
422 `booking_id`.

Six tests cover these rules, alongside the original eight.

---

## Why there is no staging

NP7's preview deployments read the **live** Supabase project — verified: the
database URL and the service-role key are configured for Production and Preview
alike, one pair. Opening a preview would put real bookings and contacts behind
nothing but an unguessable URL, so preview protection stays on.

The agreed shape is therefore **production-first, behind the secret**: NP7 ships
the endpoints, wind.coach builds against something real. Phase 1 worked exactly
this way. The safety net is the same one it always was — an unmatched payload
parks in the review queue instead of doing damage.

---

## Deep links back into wind.coach

The NP7 member guide page renders each focus point natively and shows
`focus_points[].key` beside its title.

**There is no per-chapter deep link yet.** wind.coach is a single-page app with
one rider-facing route; nothing reads an `fp` query parameter, so
`https://wind.coach/?fp=1.1.3.2` silently drops the key and lands on the home
screen. (The same dead link shape is in wind.coach's own drip emails — that is a
wind.coach-side bug, reported separately.)

NP7 is coded for the scheme wind.coach proposed and holds it in env vars, so it
can be switched on without an NP7 deploy:

- `NEXT_PUBLIC_WINDCOACH_URL` — the app entry point (default `https://wind.coach`)
- `NEXT_PUBLIC_WINDCOACH_KEY_URL` — per-chapter template with `{key}` substituted

Until the second one is set, the key chip renders as plain text, and the page's
bottom call-to-action points at the generic URL with `?src=np7`.

**Nothing identity-bearing goes in these URLs.** A guide page link is
forwardable, so a rider id or email in a query string is a leak with extra
steps. `?src=np7` and nothing else. If attribution is ever needed it belongs in
a signed, short-lived, single-use token with a real design behind it.

---

## Data protection — the part that is not code

NP7 GmbH and wind.coach are **separate controllers**. EU law has no "same owner"
exemption, and because the same person decides the purposes on both sides, a
supervisory authority is *more* likely to find joint controllership, not less.
Before the rider endpoint carries production traffic, Nico needs a written
decision on which relationship this is, the matching short contract, wind.coach
named as a recipient in NP7's processing record, and a line in the privacy
notice. That is a lawyer email, not a code change — and it is the item most
likely to be skipped.

The `/riders` response is deliberately shallow (a booking reference and a
display name) because minimisation is what keeps this a small conversation.

---

## Open, in rough priority order

1. Nico's go for the two read endpoints + `booking_id` → production.
2. wind.coach: env-overridable base URL, two admin-guarded proxy routes (the
   shared secret must never reach a browser), trip + rider dropdowns, trip label
   auto-filled read-only, recipient rule relaxed to *tick AND (booking_id OR
   full trip)*.
3. The `?fp=` route on the wind.coach side, plus return-to handling so a
   logged-out rider does not lose the key through the login rewrite.
4. Creating a training plan directly from the NP7 guide page. Blocked on the one
   thing neither side has: knowing which wind.coach account belongs to which NP7
   rider. Plan-building itself is nearly there — a plan holds two focus points,
   which is the shape a guide arrives in — so the missing piece is identity, and
   that needs a signed token, not a parameter.
5. Two-way **skills**. Today they flow wind.coach → NP7 only, while NP7 holds the
   six-rank ladder and mastery data. This is the one genuinely bidirectional
   domain and the best candidate for real sync.
