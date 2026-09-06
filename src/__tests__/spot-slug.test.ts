/**
 * Spot slugs, which are the URLs we paste into chats.
 *
 * The old rule kept a-z0-9 and turned everything else into a hyphen, so an
 * accent did not get dropped, it got promoted to a word break: Montana Roja came
 * out `monta-a-roja` and El Medano `el-m-dano`. Four spots were already shipping
 * damaged slugs before anyone noticed, because a broken slug still resolves, it
 * just looks like a typo to whoever you sent it to.
 *
 * The real spot and destination names from the guide are pinned here, so the next
 * accented place added cannot quietly reintroduce it.
 */
import { describe, it, expect } from "vitest";
import { slugifySpot } from "@/lib/spotguide";

describe("an accent becomes its plain letter, never a word break", () => {
  it.each([
    ["La Tejita & Montaña Roja", "la-tejita-montana-roja"],
    ["Las Américas (La Fitania)", "las-americas-la-fitania"],
    ["Playa Esquinzo (Jandía)", "playa-esquinzo-jandia"],
    ["South Bay (El Médano)", "south-bay-el-medano"],
    ["Bay of Eckernförde", "bay-of-eckernforde"],
    ["Lindhöft", "lindhoft"],
  ])("%s", (name, slug) => expect(slugifySpot(name)).toBe(slug));

  it("never leaves a hyphen where a letter was", () => {
    // The signature of the old bug: a hyphen with letters on both sides that
    // the name itself does not have a space at.
    for (const name of ["Montaña", "Médano", "Jandía", "Eckernförde", "Lindhöft"]) {
      expect(slugifySpot(name)).not.toContain("-");
    }
  });
});

describe("letters that decomposition cannot reach", () => {
  it.each([
    // Nordic. The guide already reads `sorlandet` and `ringkobing`, so o, not oe.
    ["Sørlandet", "sorlandet"],
    ["Ringkøbing", "ringkobing"],
    ["Åshavn", "ashavn"],
    // Turkish dotless i. Without it Alacati loses its last letter entirely.
    ["Alaçatı", "alacati"],
    // No single letter to fall back to, so these two spell themselves out.
    ["Straße", "strasse"],
    ["Æro", "aero"],
  ])("%s", (name, slug) => expect(slugifySpot(name)).toBe(slug));
});

describe("the ordinary cases still hold", () => {
  it("lowercases, and joins words with one hyphen", () => {
    expect(slugifySpot("Lac Bay")).toBe("lac-bay");
    expect(slugifySpot("  Torbole  ")).toBe("torbole");
  });

  it("collapses punctuation instead of stacking hyphens", () => {
    expect(slugifySpot("Sorobon — Lac Bay")).toBe("sorobon-lac-bay");
    expect(slugifySpot("Vasiliki Bay (Main Beach)")).toBe("vasiliki-bay-main-beach");
  });

  it("leaves no hyphen at either end", () => {
    expect(slugifySpot("(Jandía)")).toBe("jandia");
    expect(slugifySpot("!!!")).toBe("");
  });
});
