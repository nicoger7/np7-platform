// NP7 Hardware surface language: dark carbon alternating with bright
// "sanded primer" sections — the cold white-grey of a raw sanded blank
// (rivets-and-dust workshop feel), NOT warm beige. Accents are scarce
// on purpose: PINK is the one highlight, RED a rare signal, LIME lives
// only on CTAs/buttons. Never stack several accents in one block.

export const CARBON = "#0c0c0e";
export const CARBON_DEEP = "#0a0a0c";

export const SAND = "#e4e4e0";        // sanded primer — cold off-white
export const SAND_DEEP = "#d7d7d1";
export const INK = "#141412";          // text on primer
export const INK_SOFT = "rgba(20,20,18,0.62)";
export const INK_FAINT = "rgba(20,20,18,0.38)";
export const BONE = "#efeeea";         // light type on carbon

export const LIME = "#c6ff3a";         // CTA/buttons ONLY
export const PINK = "#ff2e88";         // THE highlight (brand gradient's tail)
export const RED = "#ff3b30";          // rare signal (custom / heat)

/** Grain tile (SVG turbulence) — the "rough" in the sand sections. */
export const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

/** Overlay style for a sand section — absolutely-positioned div, aria-hidden. */
export const sandGrainOverlay: React.CSSProperties = {
  backgroundImage: GRAIN,
  opacity: 0.2,
  mixBlendMode: "multiply",
};

/** Carbon weave lines for dark blocks (matches the existing landing pattern). */
export const carbonWeave: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 8px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 8px)",
};
