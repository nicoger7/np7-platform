// The NP7 Method — one source of truth for the flagship /method page AND the
// in-trip modal, so the words never drift. Copy from the 3-voice judge-panel
// synthesis (2026-07-18).

export const METHOD_EYEBROW = "THE NP7 METHOD";
export const METHOD_HEADLINE = "The whole rider — not just the move.";
export const METHOD_SUBHEAD =
  "Great windsurfing was never one fix on the water — it's seven things moving together. The NP7 Method is Nico's proven system for building all of them, in you, across one week by the sea. It's the coaching approach he's refined teaching hundreds of thousands of windsurfers through YouTube and camps worldwide — now built around the whole rider, with every complex movement broken into clear, actionable steps, tailored to you.";

export type MethodDimension = { name: string; oneLiner: string; body: string };

export const METHOD_DIMENSIONS: MethodDimension[] = [
  { name: "Technique", oneLiner: "The complex, broken into steps that finally click.", body: "Every move you're chasing — locking into the straps, the jibe, your first loop — is a sequence of small, learnable steps, not one impossible leap. We break the complicated down until each piece is something you can actually feel and repeat, then rebuild it in an order your body understands. And we film it and watch it back together, because seeing yourself is the moment it stops being confusing and starts making sense. This is the craft NP7 is known for: the hardest things on the water, made simple." },
  { name: "Fundamentals", oneLiner: "Get the base right and everything above it comes easier.", body: "The best riders aren't doing more — they're standing better. Before we chase the flashy stuff, we lock in the foundation: your stance, your balance, the way you carry the pull of the sail. A jibe built on a shaky stance never holds, but fix the base once and every move you build on top of it lands faster — natural instead of forced." },
  { name: "Mindset", oneLiner: "Progress is a headspace before it's a maneuver.", body: "The biggest thing between you and the next move usually isn't your arms — it's your head. The riders who improve fastest aren't the most talented; they're the ones who stay patient, curious, and willing to fall. So we coach the mental side too: how you talk to yourself after a bail, how you make peace with the wipeouts that come right before a breakthrough, how you keep showing up when the wind is testing you. Get your head right and your body follows." },
  { name: "Decision-making", oneLiner: "Knowing what to do — and exactly when.", body: "A good session is a thousand tiny decisions: when to commit, when to wait, which gust to take, when to bear away. We teach you to read the moment and make the right call in real time, so the right move becomes instinct instead of a gamble — and you stop reacting to the water and start choosing your line through it. That judgement is the quiet difference between riders who look in control and riders who just got lucky." },
  { name: "Conditions", oneLiner: "Read the wind and water like a local — don't just fight it.", body: "The wind, the swell and your gear are always telling you something, and the ocean is never the same twice. We teach you to listen — to see the gusts before they arrive, understand why a spot behaves the way it does, and dial your setup to whatever the day hands you. Once you can truly read conditions, you'll get good sessions out of days you'd have sat out before — and you're no longer tied to one beach. Every spot on earth opens up to you." },
  { name: "Confidence", oneLiner: "Earned on the water, session by session — never talked into you.", body: "Real confidence doesn't come from a pep talk — it comes from proof, built on a foundation you've learned to trust. We stack small wins on purpose, so as the fundamentals lock in and the wipeouts stop scaring you, you'll catch yourself reaching for more wind, more chop, more speed — and grinning through it. You go home at ease in conditions that would have kept you on the beach on day one, and it stays with you long after the trip." },
  { name: "Enjoyment", oneLiner: "Because this is supposed to feel incredible.", body: "Every other dimension leads here — and fun isn't the reward at the end, it's the engine. When technique, confidence and the right conditions finally line up, windsurfing stops feeling like work and turns into pure flow: that weightless, lost-in-it feeling that hooked you in the first place. We protect the joy as carefully as the technique, because the riders who love the process are the ones who keep getting better for years — and joy is what pulls you back to the water for the rest of your life." },
];

export const METHOD_MOMENTUM_HEADING = "Momentum, not moments.";
export const METHOD_MOMENTUM_BODY =
  "Nobody transforms in a single moment on the water — real progress is momentum, and it builds. The day you book the week, you've already made the real decision: to get better. From there it compounds — morning focus into evening video, one session standing on the last. And because it's a week where windsurfing is the only topic — talked over breakfast, watched back at night, lived from sunrise to sunset with a crew who love it as much as you do — you're not squeezing in a lesson, you're fully immersed. That combination, momentum plus your crew, is exactly where the real jump happens.";

export const METHOD_CLOSING =
  "The best part is you can start living the Method today. Dig into the free technique articles, take one focus point into your very next session, and feel it work on your own local water. But the real leap — all seven dimensions at once, six days on the water, a hand-picked crew beside you and a coach in your corner — happens on a trip, where everything you've read turns into the way you actually ride. This is the week it all finally clicks. We'll see you on the water.";

// The daily coaching loop — the visualised "mechanism" (Ride → Film → Break it
// down → One focus point → back to the water).
export const METHOD_LOOP: { label: string; note: string }[] = [
  { label: "Ride", note: "On the water with a clear goal" },
  { label: "Film", note: "We shoot every session" },
  { label: "Break it down", note: "Frame-by-frame each evening" },
  { label: "One focus point", note: "The single thing for tomorrow" },
];

// The week's momentum arc — booking is the commitment; the jump compounds.
export const METHOD_WEEK: { k: string; label: string; sub: string }[] = [
  { k: "Book", label: "You commit", sub: "The real decision: to get better" },
  { k: "Day 1", label: "Baseline", sub: "First sessions + your starting point on video" },
  { k: "Day 3", label: "It clicks", sub: "Fundamentals lock in, fear fades" },
  { k: "Day 6", label: "The jump", sub: "Everything moving together" },
];
