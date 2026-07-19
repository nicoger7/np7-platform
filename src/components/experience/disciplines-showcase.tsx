"use client";

import { useState } from "react";

// Order = priority. Windsurf is the heritage, windfoil the new frontier — both
// core. Wingfoil is the playful side-option for when conditions go light.
const DISCIPLINES = [
  {
    key: "windsurf", name: "Windsurf", tag: "Plane, jibe, send", eyebrow: "The heritage · where it all begins",
    color: "#00afdb",
    image: "https://media.np-seven.com/experiences/np7-alacati/action/alacati-experience-action-nico-2.jpg",
    blurb: "Windsurfing is the heart of everything we do — the sport we fell in love with and never stopped chasing. There is nothing like the moment the board lifts and you are planing, powered by nothing but the wind. It is demanding, humbling and endlessly deep: it teaches you patience, how to read nature, how to stay calm when it turns wild — lessons that follow you well off the water. To us it is simply the best sport in the world, and every NP7 week is built around it.",
  },
  {
    key: "windfoil", name: "Windfoil", tag: "Silent, fast, weightless", eyebrow: "The new frontier",
    color: "#ffc42e",
    image: "https://media.np-seven.com/experiences/np7-alacati/action/participant-action-alacati-on-foil-with-coach.jpg",
    blurb: "Foiling under a sail is the newest thrill on the block — technical, precise and unlike anything else on the water. You rise up on a whisper and glide, silent and fast, chasing gusts upwind and down that you would never reach otherwise. It opens the wind range wide: the light days that used to keep you on the beach become some of your best sessions. If you love the fine feeling of dialling something in, windfoiling becomes the next obsession — and we coach it right alongside your windsurfing all week.",
  },
  {
    key: "wingfoil", name: "Wingfoil", tag: "Fly above the water", eyebrow: "The playful side option",
    color: "#f47b20",
    image: "https://media.np-seven.com/experiences/np7-bonaire/action/winging-in-bonaire-2.jpg",
    blurb: "Wing in hand, foil underfoot — the easiest way onto a foil, and pure fun. It is the perfect thing to reach for when the wind goes light or the conditions are not quite right for a proper windsurf session: grab a wing, get flying, keep the stoke going. It is the side-dish, not the main course — but on the right day it is a blast, and we are always happy to get you up and riding.",
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
              className={`group relative rounded-3xl overflow-hidden p-7 h-[190px] flex flex-col justify-end text-left text-white shadow-[0_24px_50px_rgba(0,20,30,0.28)] transition-all ${on ? "ring-2 ring-white/70 -translate-y-1" : "opacity-85 hover:opacity-100"}`}
              style={{ background: `linear-gradient(160deg, ${d.color}, #00374a)` }}>
              <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url('${d.image}')` }} />
              <div className="absolute inset-0 mix-blend-multiply opacity-55" style={{ background: `linear-gradient(160deg, ${d.color}, #00374a)` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#00131b]/80 via-transparent to-transparent" />
              <h3 className="relative text-2xl font-black tracking-[-0.02em]">{d.name}</h3>
              <p className="relative text-[13px] font-semibold text-white/80 mt-1">{d.tag}</p>
            </button>
          );
        })}
      </div>

      {/* the selected discipline's story — folds/changes below the cards */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-7 sm:p-9">
        <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: sel.color }}>{sel.eyebrow}</p>
        <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-white mt-1.5">{sel.name}</h3>
        <p className="text-[15px] sm:text-[16px] text-white/70 leading-relaxed mt-3 max-w-[760px]">{sel.blurb}</p>
      </div>
    </div>
  );
}
