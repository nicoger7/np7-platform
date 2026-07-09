# NP7 Progression & wind.coach integration

How the member skill/progression system works, what's in it today, and how it
shares verifications with **wind.coach** (Enrico's year-round rider-progress app).

---

## 1. How the progression works

### Ranks — earned by mastering skills, not points
Six ranks, climbed in order:

**Beginner → Intermediate → Advanced → Amateur → Semi-Pro → Pro**

There are no points and no difficulty numbers. **Every skill is assigned a rank
directly** — the team places each skill into one of the six bands in admin (you
literally drag the skill into the band). You reach a rank by **mastering the skills
in that band**; master every core band in turn and you climb.

The rank is a *shared, cross-track calibration*: "Advanced" means the same thing
whether it's a Freeride skill or a Freerace skill, which is why a human sets it —
the system can't infer it from learning order alone (a Slalom skill 3rd in its
chain and a Freeride skill 3rd in its chain aren't the same rank).

### Disciplines (tracks)
Skills live in four tracks:

- **Freeride** — the core windsurf journey (uphaul → planing → straps/harness →
  jibes → waterstart → chop hop → speed control).
- **Freerace** — railing, the speed & control ladder, power jibe, tuning.
- **Slalom** — racing basics/advanced, racing jibes, top speed, consistent starts.
- **Wave & Freestyle** — waves and freestyle moves.

**Freeride, Freerace and Slalom are the three CORE tracks** that drive your rank.
**Wave & Freestyle is a "side" track** — extra mastery that shows on your profile
but does **not** move the core rank ladder (a rider can be a wave god without
racing, and vice-versa).

Within each track, skills are grouped by rank band, and each skill has a
**prerequisite** so they unlock in a sensible learning order (e.g. Front strap
needs Planing; Top turn needs Bottom turn). Any *logged* skill satisfies a
prerequisite — the chain guides you, it never traps you.

### The three ways a skill gets confirmed (verification tiers)
A skill can be confirmed by three sources, in ascending authority:

1. **Self-logged** — the member taps *"I can do this."* Unlocks the chain and
   pre-fills a coach's checklist, but on its own it **does not move rank**.
2. **wind.coach** — verified in the Wind Coach App, by **GPS analysis** (measurable
   skills) or **video analysis** (technique) — see §3. **Counts toward rank.**
3. **Coach on an NP7 trip (gold standard)** — a coach ticks it in person on a
   trip. The surest way to climb.

Members self-log freely; the rank only moves on a *wind.coach* or *coach*
verification. All of this is editable by the team in **admin → Progress Skills**.

---

## 2. What we already have (inventory)

The live catalog (editable in admin → Progress Skills):

- **Freeride** — Uphaul, Rigging, Steering, Go & return, Upwind, Beach start,
  Tack, Planing, Harness, Front strap, Back strap, Jibe entry, Non-planing jibe,
  Trim, Fast tack, Waterstart, 20kn max speed, 20kn control, Carve jibe,
  Underpowered, Chop hop.
- **Freerace** — Railing, 25kn max speed, 25kn control, 30kn max speed,
  30kn control, Board flying, Tuning, Overpowered, Duck jibe, Power jibe.
- **Slalom** — Inside jibe, Outside jibe, Racing basics, Racing advanced,
  35kn max speed, 35kn control, 40kn top speed, 40kn control, and the
  **consistent-starts** ladder (0–5 s → 0–2 s → 0–1 s).
- **Wave & Freestyle** (side) — Sail 360, Body drag, Wave jump, Heli tack,
  Bottom turn, Top turn, Cutback, Forward loop, Back loop, Push loop, Table top,
  Air jibe, Spock, Flaka.

---

## 3. wind.coach integration — one vocabulary, cross-shared verifications

NP7 and wind.coach share **one skill vocabulary**: every skill has a stable
`key`, and both apps speak the same keys. That's what lets a verification earned
in one place count in the other. A rider's progress is *the same progress*,
whether they earned it on an NP7 trip or in wind.coach between trips.

**wind.coach runs two analysis engines**, and both feed back into NP7 as a single
`windcoach`-tier verification:
- **GPS analysis** — auto-verifies the measurable skills (speeds, start timing).
- **Video analysis** — verifies the technique skills (jibes, tacks, loops, waves).

So a rider between trips can rank up either way in wind.coach; on a trip, an NP7
coach is the third (gold) tier. There are **two kinds of skills**, split by *how
they're measured / who authors them*:

### A. Technique / non-GPS skills — **owned by NP7**
The maneuvers: jibes, tacks, transitions, loops, wave riding, freestyle.

- **Authored by NP7.** NP7 is the source of truth; these skills are pushed *to*
  wind.coach.
- **Verified by:** an NP7 **coach on a trip** (gold), **or** wind.coach's
  **video analysis**.
- A jibe you get video-verified in wind.coach shows as verified in your NP7
  progress, and a coach-verified skill on a trip shows in wind.coach. Same skill,
  either door.

### B. GPS-based skills — **owned by wind.coach (Enrico)**
The measurable performance skills — anything a GPS track proves. **The exact
catalog here is Enrico's to define, not NP7's:** wind.coach has GPS features and
detail NP7 hasn't seen yet, so *which* skills exist, what they measure and where
the thresholds sit are his call. This half of the ladder lives in his hands.

- **Authored by Enrico** in wind.coach's GPS feature. wind.coach is the source of
  truth; these are transferred *into* the NP7 progression.
- **Verified by:** wind.coach's **GPS data, automatically** — hit 40 knots on GPS
  and the skill verifies itself; land your starts inside 0–2 s consistently and it
  verifies.
- The GPS verification syncs back into NP7 as a wind.coach-tier verification.

### The rule, in one line
> **Non-GPS (technique) skills come from NP7** and are verified by an NP7 coach or
> wind.coach video. **GPS skills come from wind.coach** and are verified by
> wind.coach GPS. Both count in **both** systems.

This split is deliberate: NP7 owns *coaching craft* (what a good jibe looks like);
wind.coach owns *measured performance* (what the GPS proves). Neither duplicates
the other, and the rider sees one unified ladder.

### Which of today's skills fall on each side

**GPS-owned → Enrico defines the exact set.** The measured-performance half of the
ladder is wind.coach's domain, and the precise skills, metrics and thresholds are
**his to specify** — wind.coach has GPS detail NP7 hasn't seen yet, and his set is
likely richer than what we hold. NP7 has only seeded a few **placeholder** keys so
the vocabulary is there to align to:

> _placeholders, pending Enrico's definitive list:_ Top / max board speed
> (`20kn max speed` … `40kn top speed`) · Consistent starts (`0–5 s`, `0–2 s`, `0–1 s`).

**Enrico's list supersedes these** — the `key`s line up on both sides. Don't treat
the placeholders as final; the GPS catalog is his to own.

**NP7-owned — coach on a trip or wind.coach video (technique):** everything else —
all jibes/tacks/transitions, straps & harness, waterstart, chop hop, railing,
tuning, racing basics/advanced, the whole Wave & Freestyle track, **and the
"control in N knots" skills** (`20kn control` … `40kn control`).

Those control skills stay NP7-owned on purpose: they measure the rider being **in
control of that wind strength** — a coaching/technique judgment — *not* the speed
they make on the GPS track. **Wind strength ≠ board speed.**

---

## 4. What's built vs. still to build

**Built today**
- The full rank/band/discipline/prerequisite engine and the member Progress page.
- Three verification tiers on each achievement (`contact_milestones.verified_via`
  = `self` | `windcoach` | `coach`).
- An inbound webhook slot for wind.coach verifications (`WINDCOACH_WEBHOOK_SECRET`).
- The admin Progress Skills editor: add / edit / retire skills and set a skill's
  rank by **dragging it into the band** (rank is stored directly on the skill —
  migration 077 — which replaced the old difficulty number; drag within a band to
  reorder). Keys stay stable, so the wind.coach join is unaffected.
- The GPS-based slalom skills (top speed, consistent starts) already seeded so the
  vocabulary is ready for wind.coach to verify against.

**To build for the full loop**
- **Enrico defines the GPS skill set** — the exact measured-performance skills,
  their metrics and thresholds live in wind.coach and are **his to own**; NP7 adopts
  his list (our current speed/start entries are placeholders holding keys). Not ours
  to guess. The "control in N knots" skills are settled on the NP7 side — technique.
- A **`gps` (boolean) / `source` tag** on the skill catalog (`level_milestones`)
  so each skill records whether it's wind.coach-GPS or NP7-technique — the switch
  that routes a skill's authority and sync direction. NP7's placeholder GPS entries
  give way to Enrico's list once he's defined it.
- The **two-way sync**: NP7 → wind.coach (push technique skills + coach
  verifications), and wind.coach → NP7 (GPS + video verifications land via the
  webhook and write a `windcoach`-tier `contact_milestone`).

Keeping the skill `key`s stable across both apps is the one hard rule — the keys
are the join between NP7 and wind.coach. (Ranks are now stored on the skill —
migration 077 — but that's an NP7-internal detail; it doesn't touch the `key`s or
the sync.)
