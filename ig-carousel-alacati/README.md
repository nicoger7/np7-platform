# IG carousel — NP7 Experience Alaçatı reviews

7-slide feed carousel (1080x1350, 4:5) plus a 9:16 story version of slide 1.
Concept: open with a fake 1-star "complaint" that's actually a boast (the
scroll-stopper), land on five real verified 5-star reviews from Alaçatı,
close with a plain call to action for the next Alaçatı week.

## Where things are

- `slides/` — the 7 feed PNGs, 1080x1350
- `story/` — slide 1 reformatted for 9:16 (1080x1920)
- `html/` — the exact static HTML each PNG was rendered from (fonts embedded
  as base64, no external dependencies — open any one directly in a browser
  to see precisely what was screenshotted)

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
Chrome rasterizes them directly.

The render script (`build.mjs`) and its `puppeteer-core` install were kept
**outside** this repo, in a scratch workspace, on purpose — this is a
one-off marketing asset, not app code, and it didn't seem right to add a
new build dependency to `package.json` for it. Nothing in the existing repo
was modified; everything here is new files under `ig-carousel-alacati/`.
Re-running is straightforward if useful later: the `html/*.html` files are
fully self-contained (fonts embedded), so any headless-Chrome/Puppeteer
script that sets a 1080-wide viewport and screenshots them will reproduce
the PNGs exactly.

## Brand recipe reused (not invented)

- **Colours** — straight from `src/app/globals.css`: deep ocean
  `#00374a`, ocean `#00afdb`, accent `#0aa3c7`, foam `#8fe6f2`, sun
  `#ffc42e`, coral `#f47b20`, sand `#fff7ec`. The background is the same
  "sun to sea" warm-into-cyan wash used in `GRADIENT_PRESETS` in
  `src/lib/promo-template.ts` and in the `BrandedTile` colour washes
  (`src/components/experience/branded-tile.tsx`) — kept deliberately warm,
  not all-cyan, per the brand note about the sun-yellow-to-coral accent.
- **Gold headline gradient** — the exact 4-stop gradient
  `#fff2c2 → #ffd257 → #f4a11f → #d97a12` that `BrandedTile` uses for the
  big place name (e.g. "ALAÇATI"), reused on the CTA slide's headline.
- **Type** — Poppins (the brand's body/display face per
  `src/app/layout.tsx`) for all copy and quotes; Anton (the tile place-name
  face) for the "NP7." wordmark and the CTA headline. Both loaded at
  weights already used elsewhere in the app (Poppins 400–900, Anton 400).
- **Stars + "Verified" badge** — the star glyph pattern and the pill-shaped
  checkmark "Verified" badge mirror `src/components/experience/guest-reviews.tsx`
  (`stars()` helper, `#ffd24a`/`#ffd24a`-family gold, and the
  `M20 6L9 17l-5-5` checkmark path used for `Verified`).
- **No em dashes** anywhere in NP7's own copy (headline, disclaimer, CTA,
  eyebrows), per standing feedback that they read as AI-written. Commas,
  periods and a middot (`·`) are used instead.

## No guest photos

By design, no photo of any kind is used — no guest faces, no stock/gear
photography either, since there's no `may_use_in_marketing` flag in the
database yet to clear any specific guest for use. Every slide is built from
brand colour washes, an abstract wave-line motif (drawn as inline SVG, not
a photo), type, and the gold/star/badge iconography above.

## Slide-by-slide

| # | File | Type | Copy | Source |
|---|------|------|------|--------|
| 1 | `slides/01-joke-1080x1350.png` | Fake 1-star (the joke) | "1 star. Ruined windsurfing for me. Now every other holiday feels flat." + "(not a real review. the next ones are.)" | Original copy, written for this carousel — not a guest quote |
| 2 | `slides/02-ziad-1080x1350.png` | Real 5-star, verified | "NP7 Experience Alaçatı gets top top ratings, from start to finish. The whole experience was incredible!" | Ziad Khoury, Bahrain — `exp_reviews.id 1acee498…`, booking-verified |
| 3 | `slides/03-giuseppe-1080x1350.png` | Real 5-star, verified | "Great experience at NP7 Alaçatı. Nico Prien is not only an outstanding professional and coach, but also a genuinely great person." | Giuseppe Picentino, Italy — `exp_reviews.id f51052c4…`, booking-verified |
| 4 | `slides/04-thomas-1080x1350.png` | Real 5-star, verified | "The setup, coaches and the total experience was just so much more than expected. You guys are just so humble and service minded." | Thomas Jönsson, Sweden — `exp_reviews.id 72e4d78d…`, booking-verified |
| 5 | `slides/05-andreas-1080x1350.png` | Real 5-star, verified | "This was a first for me and getting to know Nico, Lars, Dennis and Alacati was a really magical moment at the top of my 48 years!" | Andreas Burmeister, Brasil — `exp_reviews.id eb57ab7e…`, booking-verified |
| 6 | `slides/06-michael-1080x1350.png` | Real 5-star, verified | "It was my first NP7 Experience and for sure not my last one!" | Michael Bongar, Austria — `exp_reviews.id 60378b56…`, booking-verified |
| 7 | `slides/07-cta-1080x1350.png` | Plain CTA | "The next week is open." / "Seven days of windsurf coaching in Alaçatı's flat water lagoon. Small group, real progress, guided the whole way." / "Link in bio to book your week." | Original copy |
| — | `story/01-joke-story-1080x1920.png` | Slide 1, 9:16 | Same copy as slide 1 | — |

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

- **Slide 1's exact wording** is original, written to match the shape given
  in the brief ("1 star. Ruined windsurfing for me...") rather than reusing
  it verbatim — "ruined windsurfing for me... now every other holiday feels
  flat" keeps the same boast-as-complaint joke but adds a windsurf-specific
  double meaning ("flat" = no wind/flat water, a windsurfer's actual
  nightmare), which felt more NP7-voiced than a generic version.
- **No review-platform chrome** (no Google/Trustpilot-style logo or star
  widget) was used on slide 1 — it's an original NP7-styled card, not a
  copy of any real platform's UI, so the satire never risks reading as an
  impersonation of an actual review site. The bottom disclaimer makes the
  joke explicit regardless.
- **Turkish characters** (Alaçatı's ç / dotless ı) render correctly in
  Poppins at every size used; spot-checked visually in the rendered PNGs.
  Andreas Burmeister's own review spells it "Alacati" without diacritics —
  kept exactly as he wrote it (verbatim quote), not corrected.
- **Page counters** ("02 / 07" etc.) and the small "NP7." mark sit outside
  the outer 8% safe margin on all four sides (≥114px top/bottom on the
  1080x1350 canvas, ≥158px on the 1080x1920 story canvas, ≥92px left/right
  on both) — this was tightened once during the build after an initial pass
  had the top brand mark and bottom page counter a few pixels inside the
  safe zone.
- Slide 1 deliberately carries no "Experience Alaçatı" location tag (unlike
  slides 2–7) since the joke is meant to land as a universal NP7 hook before
  the carousel narrows to Alaçatı specifically.
