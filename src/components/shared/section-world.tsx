import { SECTION_CHROME, type Section, type SectionChrome } from "@/lib/blog-section";

/**
 * The reader's world (Experience / Hardware), decided in the BROWSER.
 *
 * Magazine, Spotguide and About belong to both worlds, so they used to pick
 * their chrome from the np7_section cookie while rendering. A single cookies()
 * read opts the whole route out of ISR — which stayed invisible only because
 * `flags.showHardware` short-circuited it in production. The day SHOW_HARDWARE
 * is set, /about, /blog, /blog/[slug] and /spotguide would all have dropped off
 * the CDN and started rendering per request.
 *
 * So the HTML is world-neutral and cacheable: every colour that used to be a
 * server-picked hex is a CSS variable, both headers render with CSS showing one,
 * and an inline script stamps `data-np7-section` on <html> before first paint
 * (the dark-mode theme-script trick — no flash). No attribute means Experience,
 * so the cached markup is already correct for the common case.
 */

const VAR: Record<keyof SectionChrome, string> = {
  heroBg: "--np7-hero-bg",
  heroBackground: "--np7-hero-background",
  stripe: "--np7-stripe",
  eyebrow: "--np7-eyebrow",
  accent: "--np7-accent",
  onAccent: "--np7-on-accent",
};

const KEYS = Object.keys(VAR) as (keyof SectionChrome)[];

/** Drop-in for `SECTION_CHROME[section]` on the shared pages — same shape, but
 *  every value defers the choice to the browser. */
export const SECTION_VARS = Object.fromEntries(
  KEYS.map((k) => [k, `var(${VAR[k]})`]),
) as SectionChrome;

const declare = (s: Section) => KEYS.map((k) => `${VAR[k]}:${SECTION_CHROME[s][k]}`).join(";");

export const SECTION_CSS = [
  `:root{${declare("experience")}}`,
  `html[data-np7-section="hardware"]{${declare("hardware")}}`,
  // Both world variants sit in the DOM (the two headers, the About CTA); only
  // the reader's is displayed. Hiding rather than showing keeps whatever display
  // the element's own classes give it.
  `html[data-np7-section="hardware"] [data-np7-section="experience"],` +
    `html:not([data-np7-section="hardware"]) [data-np7-section="hardware"]{display:none}`,
  // BlogFooter paints its background from an inline style, which no stylesheet
  // rule can out-rank on specificity alone.
  `.np7-section-footer>footer{background-color:var(${VAR.heroBg})!important}`,
].join("");

/** `?from=` wins over the cookie, exactly as the server used to resolve it. */
export const SECTION_SCRIPT =
  `(function(){try{` +
  `var f=new URLSearchParams(location.search).get("from"),` +
  `c=/(?:^|; )np7_section=([^;]*)/.exec(document.cookie),` +
  `w=f||(c?decodeURIComponent(c[1]):"");` +
  `if(w==="hardware")document.documentElement.setAttribute("data-np7-section","hardware")` +
  `}catch(e){}})()`;
