/**
 * Section chrome for the magazine + About. These span both worlds, so their
 * frame (header, hero, filter tabs, footer) adopts the colours of the section
 * the reader came from — exactly like the member area (portal-chrome) — driven
 * by the `np7_section` cookie. This is separate from the per-post category
 * theme (Travel/Gear/Technique in blog-templates.ts), which still tints the
 * individual cards and posts.
 *
 * Experience keeps the brand's "sun to sea" warmth — a sun-yellow → coral glow
 * up top fading into bright ocean below — NOT an all-cyan wash. Hardware mirrors
 * it with the workshop's neon lime → pink.
 *
 * Pure module (no server deps) so client + server can both import it.
 */
import { SUN_TO_SEA } from "@/components/shared/brand";

export type Section = "experience" | "hardware";

export function resolveSection(v: string | null | undefined): Section {
  return v === "hardware" ? "hardware" : "experience";
}

export type SectionChrome = {
  heroBg: string; // solid background (footer)
  heroBackground: string; // full hero background incl. the sun→sea glow
  stripe: string; // thin accent bar — the literal brand gradient
  eyebrow: string; // small label colour
  accent: string; // active tab / CTA accent
  onAccent: string; // text colour that reads on `accent`
};

export const SECTION_CHROME: Record<Section, SectionChrome> = {
  experience: {
    heroBg: "#00374a",
    // sun overhead (yellow→coral) fading into bright ocean rising from below
    heroBackground:
      "radial-gradient(90% 70% at 50% -25%, rgba(255,196,46,0.40) 0%, rgba(244,123,32,0.22) 32%, transparent 66%)," +
      "radial-gradient(120% 95% at 50% 125%, rgba(0,175,219,0.45) 0%, rgba(0,175,219,0.12) 42%, transparent 72%)," +
      "#00374a",
    stripe: SUN_TO_SEA, // #ffc42e → #f47b20 → #00afdb
    eyebrow: "#ffc42e",
    accent: "#00afdb",
    onAccent: "#00374a",
  },
  hardware: {
    heroBg: "#0c0c0e",
    heroBackground:
      "radial-gradient(90% 70% at 50% -25%, rgba(194,255,56,0.30) 0%, transparent 60%)," +
      "radial-gradient(120% 95% at 50% 125%, rgba(255,46,136,0.28) 0%, transparent 66%)," +
      "#0c0c0e",
    stripe: "linear-gradient(90deg,#c2ff38,#7cff6b,#ff2e88)",
    eyebrow: "#c2ff38",
    accent: "#c2ff38",
    onAccent: "#0c0c0e",
  },
};
