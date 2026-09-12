import { describe, it, expect } from "vitest";
import {
  parseMeasurementText, rockerReadout, riseMarkerStation, zeroCrossing, widestPoint, interpolate,
} from "@/lib/board-measurements";

/**
 * The fixture is Nico's real measuring session for the FMX 2026 Slalom 85,
 * pasted verbatim — typos, missing separators, German caveats and all.
 *
 * That is the point of it. The parser's job is not to read a tidy format; it is
 * to read what a person actually types with wet hands, and every ugly line
 * below is a case that would otherwise have silently dropped a reading:
 * "40 2,2mm" has no separator and a comma decimal, "90 - 1.5mma" has a typo
 * stuck to the unit, "30 0.3mm (- the inverted V)" carries a caveat in
 * brackets, and "Normal V from here" is a sign flip written as a sentence.
 */
const SESSION = `Fmx 2026 slalom 85

Thickness

90 - 13.8cm

Width (bottom)
10
20
30
40
50 - 67.5 cm
60 - 71.5cm
70 - 74.5cm
80 - 77.5cm
90 - 79cm
100 - 80.5cm
110 - 81,2cm
120 - 82cm
140 - 81.7cm
160

Rocker
10 - 0
20
30
40
50 - 0
60
70
80 - start
90 - 1mm
110 - 4.5mm
140 - 19mm
160 - 35mm

V - inverted!! (Alles halbieren)
10 0.2mm
20
30 0,9mm
40 2,2mm
50 2.1mm
60 2mm
70 - 1.9mm
80 - 0
Normal V from here
90 - 2.9mm
100 - 6.1mm
110 - 15mm
120 - 18mm
140 25mm
160 25mm
180 16mm

Double Concave

10
20
30 0.3mm (- the inverted V)
40 2mm ( minus the inverted V)
50
60
70 2.2 (minus the inverted V)
80 2mm
90 - 1.5mma
100 1.5mm
110 - 2.1mm
120 - 2.5mm
140 - 3mm
160 - 5mm
180 - 6mm`;

const parsed = parseMeasurementText(SESSION);
const byMetric = (m: string) => parsed.series.find((s) => s.metric === m)!;
const valueAt = (m: string, station: number) => byMetric(m).points.find((p) => p.station === station)?.value ?? null;

describe("parseMeasurementText", () => {
  it("finds every metric heading, and only the headings", () => {
    expect(parsed.series.map((s) => s.metric)).toEqual(["thickness", "width", "rocker", "v", "concave"]);
  });

  it("keeps the board title out of the data", () => {
    // "Fmx 2026 slalom 85" starts with a letter and matches no metric word, so
    // it must land in `ignored` rather than becoming a heading or a reading.
    expect(parsed.ignored).toContain("Fmx 2026 slalom 85");
  });

  it("reads a comma decimal and a missing separator", () => {
    expect(valueAt("width", 110)).toBe(81.2);   // "110 - 81,2cm"
    expect(valueAt("v", 40)).toBe(-2.2);        // "40 2,2mm" — no dash at all
  });

  it("keeps an unmeasured station instead of dropping it", () => {
    const blank = byMetric("width").points.find((p) => p.station === 10)!;
    expect(blank.value).toBeNull();
    expect(blank.text).toBeNull();
  });

  it("keeps a word reading as a word", () => {
    expect(byMetric("rocker").points.find((p) => p.station === 80)!.text).toBe("start");
  });

  it("flips the sign at the directive and records why", () => {
    // Inverted V through the tail…
    expect(valueAt("v", 10)).toBe(-0.2);
    expect(valueAt("v", 70)).toBe(-1.9);
    // …zero at the crossover…
    expect(valueAt("v", 80)).toBe(0);
    // …then normal V forward of it.
    expect(valueAt("v", 90)).toBe(2.9);
    expect(valueAt("v", 180)).toBe(16);
    expect(byMetric("v").points.find((p) => p.station === 90)!.note).toBe("Normal V from here");
  });

  it("does not act on a caveat, it proposes it", () => {
    const v = byMetric("v");
    expect(v.suggestions.find((s) => s.kind === "scale")?.value).toBe(0.5);
    // The values themselves are untouched — 0.2 stays 0.2, not 0.1.
    expect(valueAt("v", 10)).toBe(-0.2);
    expect(v.convention).toContain("Alles halbieren");
  });

  it("reads the variant out of the heading", () => {
    expect(byMetric("concave").variant).toBe("double");
  });

  it("carries a bracketed caveat onto the reading", () => {
    const p = byMetric("concave").points.find((s) => s.station === 40)!;
    expect(p.value).toBe(2);
    expect(p.note).toBe("minus the inverted V");
    expect(byMetric("concave").suggestions.find((s) => s.kind === "relative_to")).toBeUndefined();
  });

  it("survives a typo stuck to the number", () => {
    // "90 - 1.5mma"
    expect(valueAt("concave", 90)).toBe(1.5);
  });

  it("takes the unit from the readings", () => {
    expect(byMetric("width").unit).toBe("cm");
    expect(byMetric("rocker").unit).toBe("mm");
    expect(byMetric("thickness").unit).toBe("cm");
  });
});

describe("readouts", () => {
  const pts = (m: string) =>
    byMetric(m).points.filter((p) => p.value != null).map((p) => ({ station: p.station, value: p.value as number }));

  it("calls the nose end the scoop and the tail end the tail kick", () => {
    const r = rockerReadout(pts("rocker"), "tail");
    expect(r.scoop).toEqual({ station: 160, value: 35 });
    // Stations 10 and 50 read zero, so there is no kick measured at the tail.
    expect(r.tailKick).toBeNull();
    expect(r.flatFrom).toBe(10);
    // Last ZERO reading. The board is flat past it — see the next test.
    expect(r.flatTo).toBe(50);
  });

  it("takes the rise from the written marker, not the last zero", () => {
    // "80 - start" is where the rocker begins. Without reading it, the readout
    // would report a board flat to 50 that is really flat to 80.
    const marker = riseMarkerStation(
      byMetric("rocker").points.map((p) => ({ metric: "rocker", station: p.station, text_value: p.text, note: p.note })),
    );
    expect(marker).toBe(80);
    const r = rockerReadout(pts("rocker"), "tail", marker);
    expect(r.riseFrom).toBe(80);
    expect(r.riseFromMarker).toBe(true);
  });

  it("finds the V crossover", () => {
    expect(zeroCrossing(pts("v"))).toBe(80);
  });

  it("finds the widest bottom reading", () => {
    expect(widestPoint(pts("width"))).toEqual({ station: 120, value: 82 });
  });

  it("never overshoots between two readings", () => {
    // Between 120 (82 cm) and 140 (81.7 cm) the outline narrows. A Catmull-Rom
    // would bulge past 82 here; monotone cubic may not.
    for (let s = 120; s <= 140; s += 2) {
      const y = interpolate(pts("width"), s)!;
      expect(y).toBeLessThanOrEqual(82.0001);
      expect(y).toBeGreaterThanOrEqual(81.6999);
    }
  });

  it("clamps rather than extrapolating past the last reading", () => {
    expect(interpolate(pts("width"), 500)).toBe(81.7);
    expect(interpolate(pts("width"), 0)).toBe(67.5);
  });
});
