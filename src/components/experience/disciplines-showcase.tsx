"use client";

import { useState } from "react";

// Order = priority. Windsurf is the heritage, windfoil the new frontier — both
// core. Wingfoil is the playful side-option for when conditions go light.
// The story is split so it stays SCANNABLE: a hook line you read in one glance,
// three keywords, then the full prose in two short columns. Same words as before
// — just no longer one intimidating block.
const DISCIPLINES = [
  {
    key: "windsurf", name: "Windsurf", tag: "Plane, jibe, send", eyebrow: "The heritage · where it all begins",
    color: "#00afdb",
    image: "https://media.np-seven.com/experiences/np7-alacati/action/alacati-experience-action-nico-2.jpg",
    hook: "The heart of everything we do — the sport we fell in love with and never stopped chasing.",
    beats: ["Pure freedom", "The planing rush", "Endlessly deep"],
    body: [
      "There is nothing like the moment the board lifts and you are planing, powered by nothing but the wind.",
      "It teaches you patience, how to read nature, how to stay calm when it turns wild — lessons that follow you well off the water. To us it is simply the best sport in the world, and every NP7 week is built around it.",
    ],
  },
  {
    key: "windfoil", name: "Windfoil", tag: "Silent, fast, weightless", eyebrow: "The new frontier",
    color: "#ffc42e",
    image: "https://media.np-seven.com/experiences/np7-alacati/action/participant-action-alacati-on-foil-with-coach.jpg",
    hook: "The newest thrill on the block — technical, precise, unlike anything else on the water.",
    beats: ["Silent", "Fast", "Weightless"],
    body: [
      "You rise up on a whisper and glide, chasing gusts upwind and down that you would never reach otherwise.",
      "It opens the wind range wide: the light days that used to keep you on the beach become some of your best sessions. If you love the fine feeling of dialling something in, windfoiling becomes the next obsession — and we coach it right alongside your windsurfing all week.",
    ],
  },
  {
    key: "wingfoil", name: "Wingfoil", tag: "Fly above the water", eyebrow: "The playful side option",
    color: "#f47b20",
    image: "https://media.np-seven.com/experiences/np7-bonaire/action/winging-in-bonaire-2.jpg",
    hook: "Wing in hand, foil underfoot — the easiest way onto a foil, and pure fun.",
    beats: ["Easy to learn", "Light-wind saviour", "Pure play"],
    body: [
      "The perfect thing to reach for when the wind goes light or conditions are not quite right for a proper windsurf session: grab a wing, get flying, keep the stoke going.",
      "It is the side-dish, not the main course — but on the right day it is a blast, and we are always happy to get you up and riding.",
    ],
  },
];

export function DisciplinesShowcase() {
  const [active, setActive] = useState(DISCIPLINES[0].key);
  const sel = DISCIPLINES.find((d) => d.key === active)!;

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-4">
        {DISCIPLINES.map((d) => {
          const on = d.key === active;
          return (
            <button key={d.key} type="button" onClick={() => setActive(d.key)} aria-expanded={on}
              className={`group relative rounded-3xl overflow-hidden p-7 h-[190px] flex flex-col justify-end text-left text-white shadow-[0_24px_50px_rgba(0,20,30,0.28)] transform-gpu transition-[transform,opacity,box-shadow] duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${on ? "ring-2 ring-white/70 -translate-y-1" : "opacity-85 hover:opacity-100 hover:-translate-y-0.5"}`}
              style={{ background: `linear-gradient(160deg, ${d.color}, #00374a)` }}>
              {/* GPU-promoted zoom wrapper. rounded-[inherit] is load-bearing: a
                  composited child can escape the button's rounded overflow clip
                  (square corners peeking out), so the wrapper clips itself with
                  the same radius. */}
              <div className="absolute inset-0 overflow-hidden rounded-[inherit] transform-gpu [backface-visibility:hidden]">
                <div className="absolute inset-0 bg-cover bg-center transform-gpu transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]" style={{ backgroundImage: `url('${d.image}')` }} />
              </div>
              <div className="absolute inset-0 mix-blend-multiply opacity-55" style={{ background: `linear-gradient(160deg, ${d.color}, #00374a)` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#00131b]/80 via-transparent to-transparent" />
              <h3 className="relative text-2xl font-black tracking-[-0.02em]">{d.name}</h3>
              <p className="relative text-[13px] font-semibold text-white/80 mt-1">{d.tag}</p>
            </button>
          );
        })}
      </div>

      {/* the selected discipline's story — hook first, then keywords, then the
          prose in two short columns (keyed so it fades in on switch) */}
      <div key={sel.key} className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden animate-[fadeUp_.45s_cubic-bezier(.22,1,.36,1)]">
        <div className="p-7 sm:p-9">
          <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: sel.color }}>{sel.eyebrow}</p>
          <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-white mt-1.5">{sel.name}</h3>

          {/* the hook — one glance, one idea */}
          <p className="relative text-[19px] sm:text-[24px] font-extrabold text-white leading-[1.28] tracking-[-0.01em] mt-4 max-w-[720px] pl-4 border-l-2"
            style={{ borderColor: sel.color }}>
            {sel.hook}
          </p>

          {/* three keywords — instantly scannable */}
          <div className="flex flex-wrap gap-2 mt-5">
            {sel.beats.map((b) => (
              <span key={b} className="rounded-full px-3.5 py-1.5 text-[12px] font-bold tracking-wide"
                style={{ background: `${sel.color}1f`, color: sel.color, boxShadow: `inset 0 0 0 1px ${sel.color}33` }}>
                {b}
              </span>
            ))}
          </div>

          {/* the full story, broken into two light columns */}
          <div className="mt-6 grid sm:grid-cols-2 gap-x-9 gap-y-3.5 max-w-[880px]">
            {sel.body.map((p, i) => (
              <p key={i} className="text-[14.5px] sm:text-[15px] text-white/65 leading-relaxed">{p}</p>
            ))}
          </div>
        </div>
        {/* accent foot — ties the panel to the chosen discipline */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${sel.color}, transparent 70%)` }} />
      </div>

      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.animate-\\[fadeUp_\\.45s_cubic-bezier\\(\\.22\\,1\\,\\.36\\,1\\)\\]{animation:none}}`}</style>
    </div>
  );
}
