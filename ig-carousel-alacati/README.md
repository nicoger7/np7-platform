# IG carousel — NP7 Experience Alaçatı reviews

7-slide feed carousel (1080x1350, 4:5) plus a 9:16 story version of slide 1.
Concept: open with a fake 1-star "complaint" that's actually a boast (the
scroll-stopper), land on five real verified 5-star reviews from Alaçatı,
close with a plain call to action for the next Alaçatı week. Revised
2026-09-03 per owner feedback: the satire slide now uses the ad board's own
approved copy (two variants, 01 and 01b), and every slide carries real
Alaçatı photography under the NP7 ocean wash.

## Where things are

- `slides/` — the feed PNGs, 1080x1350: `01-joke`, `01b-joke-alt` (alternate
  take on slide 1 — pick one when assembling the real post, they are not
  both meant to run together), `02`–`06` (the five verified reviews), `07-cta`
- `story/` — slide 1 (primary) reformatted for 9:16 (1080x1920)
- `html/` — the exact static HTML each PNG was rendered from (fonts +
  photos embedded as base64, no external dependencies — open any one
  directly in a browser to see precisely what was screenshotted)

## What it was rendered with

Local headless Chrome (`/Applications/Google Chrome.app`) driven by
`puppeteer-core`, screenshotting each HTML file at an exact 1080-wide
viewport (1350 or 1920 tall, deviceScaleFactor 1) — **not** the Vercel
`sharp` route. That matters for text: `src/app/api/share-card/route.ts`
documents that Vercel's `sharp` renders no fonts at all and ignores
`@font-face`, which is why that route draws text as opentype.js vector
paths. Headless Chrome has a real text-rendering engine, so that constraint
doesn't apply here — Poppins and Anton are loaded as normal `@font-face`
fonts (fetched once from Google Fonts, embedded as base64 in the HTML) and
Chrome rasterizes them directly. Photos are embedded the same way (base64
JPEG), so every `html/*.html` file is fully self-contained.

The render script (`build.mjs`) and its `puppeteer-core` install were kept
**outside** this repo, in a scratch workspace, on purpose — this is a
one-off marketing asset, not app code, and it didn't seem right to add a
new build dependency to `package.json` for it. Nothing in the existing repo
was modified; everything here is new files under `ig-carousel-alacati/`.
Re-running is straightforward if useful later: the `html/*.html` files are
fully self-contained (fonts + photos embedded), so any headless-Chrome/
Puppeteer script that sets a 1080-wide viewport and screenshots them will
reproduce the PNGs exactly.

## Brand recipe reused (not invented)

- **Colours** — straight from `src/app/globals.css`: deep ocean
  `#00374a`, ocean `#00afdb`, accent `#0aa3c7`, foam `#8fe6f2`, sun
  `#ffc42e`, coral `#f47b20`, sand `#fff7ec`. The photo wash is a deep-ocean
  scrim (`#00374a`/near-black-navy at low RGB, layered at varying opacity)
  rather than a flat tint, so it reads as "the brand's water" rather than a
  generic dark filter — same idea as the "sun to sea" warm-into-cyan wash
  used in `GRADIENT_PRESETS` in `src/lib/promo-template.ts` and in the
  `BrandedTile` colour washes (`src/components/experience/branded-tile.tsx`),
  kept as a soft-light accent layer over the new photo wash.
- **Gold headline gradient** — the exact 4-stop gradient
  `#fff2c2 → #ffd257 → #f4a11f → #d97a12` that `BrandedTile` uses for the
  big place name (e.g. "ALAÇATI"), reused on the CTA slide's headline.
- **Type** — Poppins (the brand's body/display face per
  `src/app/layout.tsx`) for all copy and quotes; Anton (the tile place-name
  face) for the "NP7." wordmark and the CTA headline. Both loaded at
  weights already used elsewhere in the app (Poppins 400–900, Anton 400).
- **Stars + "Verified" badge** — the star glyph pattern and the pill-shaped
  checkmark "Verified" badge mirror `src/components/experience/guest-reviews.tsx`
  (`stars()` helper, gold `#ffd24a`-family colour, and the `M20 6L9 17l-5-5`
  checkmark path used for `Verified`) — used only on the five real-review
  slides, never on the satire slide (see "Ad board convention" below).
- **No em dashes** anywhere in NP7's own copy (headlines, disclaimer, CTA,
  eyebrows), per standing feedback that they read as AI-written. Commas,
  periods and a middot (`·`) are used instead.

## Photography + legibility wash

Every slide now carries real NP7 Experience Alaçatı photography, full-bleed,
sourced from R2 (`https://media.np-seven.com/<url-encoded key>`). Over the
photo sits a layered readability wash — a horizontal scrim (strong, deep
ocean, on the left where every slide's text block lives, fading toward the
right so the photo still reads), a vertical scrim (darkest at the very top
and bottom, where the brand mark, page counter and wave signature live), and
the existing sun-to-sea brand tint as a soft-light accent on top. The wave
signature and page counter are unchanged. Text also carries a soft drop
shadow so it stays legible over the brighter parts of any given photo.

### Photos used

| Slide | Photo (R2 key, `experiences/np7-alacati/…`) |
|---|---|
| 01 / 01b / story (satire) | `place/distant-sailor-empty-bay.jpg` — the widest, emptiest water in the set, exactly matching the brief's "the satire slide reads best over the emptiest, widest water." 01 and 01b are alternates of the *same* slide (only one is meant to run in an actual post), so they intentionally share this photo rather than each claiming a distinct one from a limited safe set. |
| 02 (Ziad, Bahrain) | `place/lone-sailor-wide-bay.jpg` |
| 03 (Giuseppe, Italy) | `place/tiny-sailor-wide-seascape.jpg` |
| 04 (Thomas, Sweden) | `place/wide-bay-with-sailors.jpg` |
| 05 (Andreas, Brasil) | `action/rider-small-in-wide-bay.jpg` |
| 06 (Michael, Austria) | `action/two-sails-across-the-bay.jpg` |
| 07 (CTA) | `place/lone-board-on-blue-bay.jpg` |

No photo repeats across the seven actual slide positions (01-or-01b counts
as one position, since they're mutually exclusive alternates).

### Photos rejected (face-safety pass)

All 12 supplied files were downloaded and inspected two ways: first as
close-up crops, then — because a tight crop overstates risk — composited
exactly as the real render would use them (a 1080-wide "cover" fit,
centered, no extra zoom) and viewed at that true output scale, since that's
the honest test of "readable at 1080px." Rejected:

- **`action/windfoiler-flying-over-flat-water.jpg`** — the rider is close
  and angled toward camera; face is clearly, unmistakably readable even at
  true render scale. Rejected outright.
- **`action/distant-rider-flat-water.jpg`** — despite the filename, this
  rider is large and close in frame with an unobstructed, clearly smiling
  face. Rejected.
- **`action/distant-rider-planing-in-bay.jpg`** — same athlete, same
  session as `rider-small-in-wide-bay.jpg` (identical outfit, board,
  helmet-cam), but framed larger/closer, so the face reads more clearly.
  Since `rider-small-in-wide-bay.jpg` covers the same maneuver more safely,
  using both would also mean the same recognisable-looking guest appearing
  twice in one carousel. Rejected in favour of the smaller one.
- **`place/shaded-beach-club-terrace.jpg`** — multiple guests at
  conversational distance; several faces are legible. Rejected.
- **`place/beach-club-huts-and-boards.jpg`** — a group of roughly a dozen
  guests, clearly readable faces throughout (reads like a briefing/lineup
  photo). Rejected outright.

Approved with a specific note, since these were the closer calls:

- **`action/rider-small-in-wide-bay.jpg`** (used, slide 05) — same rider as
  the two rejected planing/flat-water shots above, but framed smaller and
  further away; at true 1080px scale the face is an unreadable few pixels,
  not a resolvable feature set.
- **`action/two-sails-across-the-bay.jpg`** (used, slide 06) — the lead
  rider's face is substantially obscured by spray at true scale; verified
  with an additional zoomed crop that no facial features survive the spray.
- **`place/lone-board-on-blue-bay.jpg`** (used, slide 07) — a distant
  paddleboarder wears a cap and dark sunglasses and reads as an unresolvable
  blur at 1080px; in the final centred crop for this slide the paddleboarder
  falls outside the visible frame entirely, leaving only the riderless board
  in the water.

No slide shows a readable face. No stock or lifestyle photography was
substituted for the rejected files — slides simply drew from the remaining
approved pool.

## Ad board convention on the satire slide (slide 1 / 1b)

Per the owner: NP7's ad board already carries two approved fake-review
lines, and this carousel's slide 1 should match that standard rather than
inventing new wording. Both variants below are used **verbatim**, including
the "14 real guest reviews" figure in the attribution line — that number
refers to NP7's broader review count on the ad board, not specifically to
the 8 verified Alaçatı reviews in `exp_reviews` (10 total, 8 verified) used
on slides 2–6 of this carousel. It was not changed to "8" to match Alaçatı,
since the brief was explicit about using the board's approved line as-is.

The board's own convention (stricter than the first draft of this carousel)
is followed exactly: **no guest name**, **no "Verified" badge** on the
satire slide, and the disclaimer reads **"Dramatised"**, not a parenthetical
aside. The satire card's eyebrow just says "Guest review" with a plain
1-star row — generic, not styled to resemble any specific review platform's
UI — so the joke can't read as impersonating a real review site.

- **01 (primary)** — "One star. Blisters, sunburn, and a grin that will not
  leave." / "Dramatised. The 14 real guest reviews all say five."
- **01b (alternate)** — "Ruined my hands. And my face. Eight days on the
  water, furiously booking again." / "Dramatised. The 14 real guest reviews
  all say five."

## Slide-by-slide

| # | File | Type | Copy | Source |
|---|------|------|------|--------|
| 1 | `slides/01-joke-1080x1350.png` | Fake 1-star (ad board copy, primary) | "One star. Blisters, sunburn, and a grin that will not leave." + "Dramatised. The 14 real guest reviews all say five." | Owner-approved ad board copy — not a guest quote |
| 1b | `slides/01b-joke-alt-1080x1350.png` | Fake 1-star (ad board copy, alternate) | "Ruined my hands. And my face. Eight days on the water, furiously booking again." + same attribution | Owner-approved ad board copy — not a guest quote |
| 2 | `slides/02-ziad-1080x1350.png` | Real 5-star, verified | "NP7 Experience Alaçatı gets top top ratings, from start to finish. The whole experience was incredible!" | Ziad Khoury, Bahrain — `exp_reviews.id 1acee498…`, booking-verified |
| 3 | `slides/03-giuseppe-1080x1350.png` | Real 5-star, verified | "Great experience at NP7 Alaçatı. Nico Prien is not only an outstanding professional and coach, but also a genuinely great person." | Giuseppe Picentino, Italy — `exp_reviews.id f51052c4…`, booking-verified |
| 4 | `slides/04-thomas-1080x1350.png` | Real 5-star, verified | "The setup, coaches and the total experience was just so much more than expected. You guys are just so humble and service minded." | Thomas Jönsson, Sweden — `exp_reviews.id 72e4d78d…`, booking-verified |
| 5 | `slides/05-andreas-1080x1350.png` | Real 5-star, verified | "This was a first for me and getting to know Nico, Lars, Dennis and Alacati was a really magical moment at the top of my 48 years!" | Andreas Burmeister, Brasil — `exp_reviews.id eb57ab7e…`, booking-verified |
| 6 | `slides/06-michael-1080x1350.png` | Real 5-star, verified | "It was my first NP7 Experience and for sure not my last one!" | Michael Bongar, Austria — `exp_reviews.id 60378b56…`, booking-verified |
| 7 | `slides/07-cta-1080x1350.png` | Plain CTA | "The next week is open." / "Seven days of windsurf coaching in Alaçatı's flat water lagoon. Small group, real progress, guided the whole way." / "Link in bio to book your week." | Original copy |
| — | `story/01-joke-story-1080x1920.png` | Slide 1 (primary), 9:16 | Same copy as slide 1 | — |

## How the 5 reviews were picked

`exp_reviews` for NP7 Experience Alaçatı (`experience_id b3896909-df2b-4ece-8631-dcedabb1b642`)
has 10 rows, all rating 5, of which 8 have a non-null `booking_id` (verified).
The 2 excluded for not being verified: Dennis Robinson and Albert Van
Popering (both strong quotes, both `booking_id: null` — not used, per the
brief's definition of "verified").

Of the 8 verified, these 5 were chosen for strength and variety:

- **Ziad Khoury (Bahrain)** — highest-energy opener, names the experience
  directly ("top top ratings... incredible!"), a strong slide 2 to keep the
  momentum right after the joke.
- **Giuseppe Picentino (Italy)** — names Nico Prien specifically and calls
  him "an outstanding professional... and a genuinely great person" —
  credibility for the coach, not just the trip.
- **Thomas Jönsson (Sweden)** — "so much more than expected... humble and
  service minded." His full review also raises a minor gear complaint
  (slippery boards); the quoted excerpt stops at the last positive sentence
  before that, which the brief's "trim to a clean sentence boundary" allows
  — nothing was added or altered, the excerpt is verbatim.
- **Andreas Burmeister (Brasil)** — the most personal line in the set ("a
  really magical moment at the top of my 48 years"), names the coaching
  team (Nico, Lars, Dennis) by name.
- **Michael Bongar (Austria)** — short, punchy closer ("my first... for
  sure not my last one!") that sets up slide 7's "the next week is open."
  His full review's closing line ("I am so greatful...") has a guest typo;
  the shorter opening line was used instead specifically to avoid needing
  to either reproduce a typo on a marketing graphic or silently correct a
  guest's verbatim words — both felt like the wrong call, so a clean
  sentence elsewhere in the same review was used instead.

Not used: Luis Marina García-Barón (Spain) — verified, but a single
backhanded-sounding line ("a good opportunity to discover those flaws...")
that reads weaker as a standalone pull-quote than the five chosen. Sibe
Wassenaar (Netherlands) and Peter ten Veldhuis (Netherlands) — both solid
and verified, held back mainly to avoid two Dutch reviews back to back and
because the five above read stronger and more varied as a set; either would
be a reasonable swap if a 6th slide is ever wanted.

## Other judgement calls

- **Slide 1 copy is verbatim from the owner's brief**, including keeping
  "14" in the attribution line rather than reconciling it with the 8
  verified Alaçatı reviews actually shown later in the carousel (see "Ad
  board convention" above) — the brief was explicit not to invent a new
  line, so the board's number was kept as given.
- **01 vs 01b are alternates, not sequential carousel slides** — both were
  rendered per the brief, sharing one background photo (the emptiest, since
  that's what the brief said reads best for the satire slide) since only
  one of the two will ever run in an actual post.
- **No review-platform chrome** (no Google/Trustpilot-style logo or star
  widget) was used on the satire slide — it's an original NP7-styled card,
  not a copy of any real platform's UI, so the satire never risks reading
  as an impersonation of an actual review site.
- **Turkish characters** (Alaçatı's ç / dotless ı) render correctly in
  Poppins at every size used; spot-checked visually in the rendered PNGs.
  Andreas Burmeister's own review spells it "Alacati" without diacritics —
  kept exactly as he wrote it (verbatim quote), not corrected.
- **Photo face-safety was judged at true 1080px render scale**, not an
  artificially zoomed crop — a close-up digital zoom overstates how a face
  will actually read at normal viewing size, so every approval/rejection
  above was made (or re-checked) against the actual composited slide. See
  "Photos rejected" for the full list and reasoning.
- **Page counters** ("02 / 07" etc.) and the small "NP7." mark sit outside
  the outer 8% safe margin on all four sides (≥114px top/bottom on the
  1080x1350 canvas, ≥158px on the 1080x1920 story canvas, ≥92px left/right
  on both).
- Slide 1/1b deliberately carry no "Experience Alaçatı" location tag
  (unlike slides 2–7) since the joke is meant to land as a universal NP7
  hook before the carousel narrows to Alaçatı specifically.
