// NP7 Hardware surface language: dark carbon alternating with bright
// "sanded blank" sections (rough, off-white, workshop-dust feel), and a
// hot accent family next to the brand lime — pink (from the brand
// gradient), electric blue, signal red. Shared by the landing page,
// product pages and shop surfaces so the rhythm stays consistent.

export const CARBON = "#0c0c0e";
export const CARBON_DEEP = "#0a0a0c";

export const SAND = "#e9e3d4";        // sanded-blank bone
export const SAND_DEEP = "#ded6c3";
export const INK = "#161510";          // text on sand
export const INK_SOFT = "rgba(22,21,16,0.62)";
export const INK_FAINT = "rgba(22,21,16,0.38)";

export const LIME = "#c6ff3a";         // primary CTA — unchanged
export const PINK = "#ff2e88";         // brand gradient's tail
export const BLUE = "#2e9bff";         // electric
export const RED = "#ff3b30";          // signal, use sparingly

/** Grain tile (SVG turbulence) — the "rough" in the sand sections. */
export const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

/** Overlay style for a sand section — absolutely-positioned div, aria-hidden. */
export const sandGrainOverlay: React.CSSProperties = {
  backgroundImage: GRAIN,
  opacity: 0.16,
  mixBlendMode: "multiply",
};

/** Carbon weave lines for dark blocks (matches the existing landing pattern). */
export const carbonWeave: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 8px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 8px)",
};
