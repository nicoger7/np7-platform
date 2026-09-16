/**
 * The archived waiver is HTML, and 18 signed PDFs in the wild opened with the
 * markup printed as text: "<h2>Participant agreement &mdash; assumption of
 * risk, release &amp; waiver of liability</h2> <p>Between <strong>NP7
 * GmbH</strong>...". A guest asked what was wrong with their document.
 *
 * Nothing on the record was wrong. Only the reading copy.
 */
import { describe, it, expect } from "vitest";
import { waiverBlocks } from "@/lib/waiver-pdf";

// The first 400 characters of a real signed waiver, verbatim.
const REAL = `
<h2>Participant agreement &mdash; assumption of risk, release &amp; waiver of liability</h2>
<p>Between <strong>NP7 GmbH</strong>, Graskamp 8, 24217 Sch&ouml;nberg, Germany (the &ldquo;Organiser&rdquo;) and <strong>Peter ten Veldhuis</strong> (the &ldquo;Participant&rdquo;).</p>
<p><em>Please read this &mdash; it&rsquo;s a real agreement.</em></p>
<h3>1 &middot; The activities</h3>
<ul><li>Windsurfing</li><li>Wing foiling</li></ul>
`;

describe("the signed waiver reads as a document, not as markup", () => {
  const blocks = waiverBlocks(REAL);
  const flat = blocks.map((b) => b.runs.map((r) => r.text).join("")).join("\n");

  it("never lets a tag or an entity reach the page", () => {
    expect(flat).not.toMatch(/<[a-z/]/i);
    expect(flat).not.toMatch(/&[a-z]+;/i);
    expect(flat).not.toMatch(/&#\d/);
  });

  it("decodes the entities into the characters they stand for", () => {
    expect(flat).toContain("assumption of risk, release & waiver");
    expect(flat).toContain("“Organiser”");
    expect(flat).toContain("it’s a real agreement");
    expect(flat).toContain("1 · The activities");
  });

  it("keeps the structure the signer saw", () => {
    expect(blocks[0].kind).toBe("h2");
    expect(blocks[1].kind).toBe("p");
    expect(blocks.filter((b) => b.kind === "li").map((b) => b.runs[0].text))
      .toEqual(["Windsurfing", "Wing foiling"]);
    expect(blocks.find((b) => b.kind === "h3")?.runs[0].text).toContain("The activities");
  });

  it("keeps the emphasis that names the parties", () => {
    const between = blocks[1].runs;
    expect(between.find((r) => r.text.includes("NP7 GmbH"))?.bold).toBe(true);
    expect(between.find((r) => r.text.includes("Graskamp"))?.bold).toBe(false);
    expect(blocks[2].runs[0].italic).toBe(true);
  });

  it("leaves a plain-text waiver alone (nothing signed before HTML regresses)", () => {
    const plain = "First paragraph.\nStill the first.\n\nSecond paragraph.";
    expect(waiverBlocks(plain)).toEqual([
      { kind: "p", runs: [{ text: "First paragraph. Still the first." }] },
      { kind: "p", runs: [{ text: "Second paragraph." }] },
    ]);
  });

  it("strips markup it does not recognise rather than printing it", () => {
    const odd = "<section><span>Only unknown tags here.</span></section>";
    const out = waiverBlocks(odd);
    expect(out).toHaveLength(1);
    expect(out[0].runs[0].text).toBe("Only unknown tags here.");
  });
});

describe("the entity table has no holes", () => {
  it("decodes German umlauts in both cases", () => {
    const t = (h: string) => waiverBlocks(`<p>${h}</p>`)[0].runs.map((r) => r.text).join("");
    expect(t("24217 Sch&ouml;nberg")).toBe("24217 Schönberg");
    expect(t("Thomas J&ouml;nsson")).toBe("Thomas Jönsson");
    expect(t("&Ouml;sterreich, &Auml;gypten, &Uuml;bung, gro&szlig;")).toBe("Österreich, Ägypten, Übung, groß");
    expect(t("G&ouml;ze Garip &middot; Ala&ccedil;at&#305;")).toBe("Göze Garip · Alaçatı");
  });

  it("decodes numeric references, decimal and hex", () => {
    const t = (h: string) => waiverBlocks(`<p>${h}</p>`)[0].runs.map((r) => r.text).join("");
    expect(t("&#8364;3,990 &#x2014; paid")).toBe("€3,990 — paid");
  });

  it("leaves an unknown entity visible rather than eating the text around it", () => {
    const t = waiverBlocks("<p>a &notarealentity; b</p>")[0].runs.map((r) => r.text).join("");
    expect(t).toContain("b");
  });
});
