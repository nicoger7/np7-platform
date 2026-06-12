/**
 * The descent. Wraps every post-hero section in one ocean that deepens as you
 * scroll — bright shallows just under the surface down to a near-black seabed
 * at the footer. The gradient lives on the wrapper's own background, so you
 * scroll *through* the water column; light falls from the surface and bubbles
 * rise. The whole page reads as a single dive instead of a stack of separate
 * modules.
 *
 * Pure CSS — no JavaScript, no client bundle, nothing to throttle or hydrate.
 * Sections placed inside should be transparent (no background of their own);
 * this is what they float on.
 */

// ONE continuous ocean column — shallow turquoise just under the surface down
// to a near-black seabed. Single gradient, no extra surface wash layered on top
// (that second layer was what made a visible band under the foam). The bright
// shallows now come purely from this turquoise top + the foam surface above it.
const OCEAN =
  "linear-gradient(180deg,#1aa3c7 0%,#129ec2 9%,#0e86ab 20%,#0a6184 38%,#024d68 56%,#00374a 76%,#02212e 100%)";

// the ocean's exact top colour — the foam surface dissolves into this so the
// hero melts seamlessly into the water with no hard edge
const SURFACE = "26,163,199"; // #1aa3c7

// deterministic bubble field (no random => no hydration drift)
const BUBBLES = [
  { left: "8%", size: 10, dur: 13, delay: 0, drift: 14 },
  { left: "21%", size: 6, dur: 17, delay: 4, drift: -10 },
  { left: "34%", size: 14, dur: 11, delay: 7, drift: 8 },
  { left: "47%", size: 7, dur: 19, delay: 2, drift: -16 },
  { left: "58%", size: 9, dur: 15, delay: 9, drift: 12 },
  { left: "69%", size: 5, dur: 21, delay: 1, drift: -8 },
  { left: "80%", size: 12, dur: 12, delay: 6, drift: 16 },
  { left: "90%", size: 7, dur: 18, delay: 3, drift: -12 },
];

export function DepthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* ONE ocean column. The hero (behind, above this box's top edge) dissolves
          into the very same turquoise via the surface element below, so there is
          a single continuous blue from the waterline all the way down — the first
          feature sits directly on it with no band between. */}
      <div className="relative" style={{ background: OCEAN }}>
        {/* The surface you dive through. Straddles the waterline (pulled up over
            the hero): a soft transparent→turquoise dissolve so the footage melts
            into the ocean with no hard edge, plus a white foam wave riding on top.
            No solid blue fill of its own — the dissolve *is* the ocean colour, so
            nothing bands. */}
        <div
          className="absolute inset-x-0 top-0 z-20 -translate-y-[62%] pointer-events-none"
          aria-hidden
        >
          <svg
            className="block w-full h-[112px] sm:h-[150px]"
            viewBox="0 0 1200 150"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="dpDissolve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`rgb(${SURFACE})`} stopOpacity="0" />
                <stop offset="54%" stopColor={`rgb(${SURFACE})`} stopOpacity="1" />
                <stop offset="100%" stopColor={`rgb(${SURFACE})`} stopOpacity="1" />
              </linearGradient>
              <linearGradient id="dpFoam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
                <stop offset="55%" stopColor="#ffffff" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* hero dissolves into the ocean turquoise */}
            <rect x="0" y="0" width="1200" height="150" fill="url(#dpDissolve)" />
            {/* foam body melting down into the water */}
            <path
              d="M0,80 C200,50 400,102 600,76 C800,48 1000,100 1200,72 L1200,150 L0,150 Z"
              fill="url(#dpFoam)"
            />
            {/* crisp white crest riding the wave line */}
            <path
              d="M0,80 C200,50 400,102 600,76 C800,48 1000,100 1200,72 L1200,90 C1000,114 800,62 600,92 C400,114 200,58 0,94 Z"
              fill="#ffffff"
              opacity="0.82"
            />
          </svg>
        </div>

        {/* bubbles rising in the viewport at any depth (CSS-only, sticky) */}
        <div className="sticky top-0 z-0 h-0" aria-hidden>
          <div className="absolute top-0 left-0 w-full h-screen overflow-hidden pointer-events-none">
            <div className="dp-bubbles absolute inset-0">
              {BUBBLES.map((b, i) => (
                <span
                  key={i}
                  className="dp-bubble"
                  style={{
                    left: b.left,
                    width: b.size,
                    height: b.size,
                    // @ts-expect-error custom props consumed by the keyframes below
                    "--dur": `${b.dur}s`,
                    "--delay": `${b.delay}s`,
                    "--drift": `${b.drift}px`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* the sections, floating on the ocean */}
        <div className="relative z-10">{children}</div>
      </div>

      <style>{`
        .dp-bubble {
          position: absolute;
          bottom: -24px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.16);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.20);
          animation: dpRise var(--dur) linear infinite;
          animation-delay: var(--delay);
          opacity: 0;
        }
        @keyframes dpRise {
          0%   { transform: translate(0, 0) scale(0.7); opacity: 0; }
          12%  { opacity: 0.55; }
          85%  { opacity: 0.4; }
          100% { transform: translate(var(--drift), -100vh) scale(1.1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dp-bubbles { display: none; }
        }
      `}</style>
    </div>
  );
}
