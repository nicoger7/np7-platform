/**
 * A SAME-PAGE ANCHOR MUST BE A PLAIN <a>, NEVER next/link.
 *
 * next/link intercepts a same-page hash click and calls preventDefault(), so
 * the browser's own anchor jump never runs and Next substitutes its own scroll.
 * That is machinery, and a moving part, for something the browser does natively
 * and correctly: a plain <a> jumps, with no router and no prefetch involved.
 *
 * Honest about the evidence: the preventDefault is measured and certain. What
 * is NOT established is that Next's substitute scroll fails in a real browser
 * window; the measuring rig here runs its tab hidden, and Chrome suppresses
 * smooth-scroll animation in a hidden tab, so every "it did not move" reading
 * from that rig is worthless. The proven page bug was a different one, an
 * invisible card swallowing the clicks (see hero-find-your-fit.tsx).
 *
 * So this rule is a simplification, not a repair: 17 in-page CTAs across
 * /experience, /experience/[slug] and /hardware, including "Reserve my spot",
 * now do the plain thing. The test keeps the eighteenth plain too.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

describe("no next/link points at a same-page anchor", () => {
  it("finds none anywhere in src", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // <Link ... href="#..."> or href={"#..."} / href={`#...`}
        if (/<Link\b[^>]*href=(?:"#|\{"#|\{`#)/.test(line)) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders, `use a plain <a href="#..."> at:\n${offenders.join("\n")}`).toEqual([]);
  });
});
