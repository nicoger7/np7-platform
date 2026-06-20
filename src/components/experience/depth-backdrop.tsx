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
      {/* ONE ocean column, starting at the very turquoise the video faded into
          above — no foam line / separator: the experiences scroll straight up out
          of the water as the scrubbed video fades away behind them. */}
      <div className="relative" style={{ background: OCEAN }}>
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
