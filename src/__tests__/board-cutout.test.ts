import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cutOutBoards, identifyBoards } from "@/lib/board-cutout";
import { resolveGoogleImageLink } from "@/lib/pd-web";

/**
 * The board cut-out on drawn pictures whose outlines are known exactly: two
 * boards standing side by side and touching where they are widest (the FMX
 * product shot), a grey gradient behind them, a shadow underneath, and leaks
 * where the background bites into a rail (switch off either leak rule in
 * board-cutout.ts and this fails).
 *
 * A real picture can be checked too (never committed, brand pictures are not
 * ours): CUTOUT_FIXTURE=/path/to/picture.jpg npx vitest run board-cutout
 * writes the cut-outs next to it.
 */

const LEN = 880, MAXH = 165;

/** Half-width at t (0 = tail, 1 = nose): a square-ish tail, an elliptic nose. */
function halfAt(t: number): number {
  if (t < 0 || t > 1) return 0;
  if (t <= 0.45) return MAXH * (0.72 + 0.28 * Math.sin((Math.PI / 2) * (t / 0.45)));
  return MAXH * Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2));
}

type Pic = { data: Buffer; w: number; h: number };

function picture(opts: { centres: number[]; top: number; leak?: boolean; w?: number; h?: number }): Pic {
  const w = opts.w ?? 800, h = opts.h ?? 1100;
  const data = Buffer.alloc(w * h * 3);
  const bg = (y: number) => Math.round(235 - (35 * y) / h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, g = bg(y);
    data[i] = g; data[i + 1] = g; data[i + 2] = g;
  }
  // A soft shadow under the boards, apart from them.
  const sy = opts.top + LEN + 45;
  for (let y = sy - 14; y <= sy + 14; y++) for (let x = 120; x < w - 120; x++) {
    const e = ((x - w / 2) / (w / 2 - 120)) ** 2 + ((y - sy) / 14) ** 2;
    if (e > 1 || y >= h) continue;
    const i = (y * w + x) * 3, g = Math.round(bg(y) - 40 * (1 - e));
    data[i] = g; data[i + 1] = g; data[i + 2] = g;
  }
  // The boards, nose up; a later board lies on top of an earlier one.
  const colours = [[200, 30, 30], [225, 25, 20]];
  opts.centres.forEach((cx, k) => {
    for (let y = opts.top; y < opts.top + LEN; y++) {
      const t = 1 - (y - opts.top + 0.5) / LEN;           // nose at the top
      const hw = halfAt(t);
      for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
        if (x < 0 || x >= w) continue;
        const i = (y * w + x) * 3, [r, g, b] = colours[k % 2];
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
  });
  // The background biting into the rails, the way a white logo at the rail
  // lets it in: short and long on the first board's outer side (the long one
  // where the boards touch, so the other side is not seen), and near the
  // second board's nose, where both of its sides are seen (FMX's swirl logo).
  if (opts.leak) {
    const bite = (k: number, side: -1 | 1, from: number, to: number, depth: number) => {
      const cx = opts.centres[k];
      for (let y = opts.top + from; y < opts.top + to; y++) {
        const t = 1 - (y - opts.top + 0.5) / LEN, hw = halfAt(t);
        const edge = side < 0 ? Math.ceil(cx - hw) : Math.floor(cx + hw);
        for (let d = 0; d < depth; d++) {
          const i = (y * w + edge - side * d) * 3, g = bg(y);      // inward from the rail
          data[i] = g; data[i + 1] = g; data[i + 2] = g;
        }
      }
    };
    bite(0, -1, 600, 612, 30);
    bite(0, -1, 520, 620, 40);
    bite(1, 1, 70, 150, 50);
  }
  return { data, w, h };
}

const png = (p: Pic) => sharp(p.data, { raw: { width: p.w, height: p.h, channels: 3 } }).png().toBuffer();

/** The half-widths a cut-out's alpha says, per row (nose first). */
async function halves(webp: Buffer): Promise<{ rows: number[]; w: number; h: number }> {
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows: number[] = [];
  for (let y = 0; y < info.height; y++) {
    let s = 0;
    for (let x = 0; x < info.width; x++) s += data[(y * info.width + x) * 4 + 3] / 255;
    rows.push(s / 2);
  }
  return { rows, w: info.width, h: info.height };
}

describe("board cut-out", () => {
  it("splits two touching boards and rebuilds each from its free side", async () => {
    const top = 90;
    // 305 px apart and 330 wide: they overlap from 30% to 77% of the length.
    const r = await cutOutBoards(await png(picture({ centres: [235, 540], top, leak: true })));
    expect(r.reason).toBeUndefined();
    expect(r.layout).toBe("standing");
    expect(r.boards).toHaveLength(2);
    for (const b of r.boards) {
      expect(b.aspect).toBeGreaterThan(2.55);
      expect(b.aspect).toBeLessThan(2.75);
      const { rows } = await halves(b.webp);
      // Row by row against the drawn outline (the box starts 2 px above the nose).
      const y0 = top - b.box.y;
      let worst = 0;
      for (let i = 10; i < LEN - 10; i++) {
        const t = 1 - (i + 0.5) / LEN;
        worst = Math.max(worst, Math.abs(rows[y0 + i] - halfAt(t)));
      }
      expect(worst).toBeLessThan(3);
      // The nose stays pointed: 1% of the length from the tip it is still narrow.
      expect(rows[y0 + Math.round(LEN * 0.01)]).toBeLessThan(halfAt(0.99) + 3);
      // The square tail stays square.
      expect(rows[y0 + LEN - 3]).toBeGreaterThan(halfAt(0.004) - 4);
    }
    // Left to right: the first board is the left one.
    expect(r.boards[0].box.x).toBeLessThan(r.boards[1].box.x);
  });

  it("reads boards lying one above the other", async () => {
    const p = picture({ centres: [235, 560], top: 90 });
    const turned = await sharp(await png(p)).rotate(90).png().toBuffer();
    const r = await cutOutBoards(turned);
    expect(r.layout).toBe("lying");
    expect(r.boards).toHaveLength(2);
    for (const b of r.boards) expect(b.w).toBeGreaterThan(b.h * 2);
  });

  it("keeps a transparent picture's own background", async () => {
    const p = picture({ centres: [400], top: 90 });
    const { data, info } = await sharp(await png(p)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let j = 0; j < info.width * info.height; j++) {
      if (data[j * 4] === data[j * 4 + 1]) data[j * 4 + 3] = 0;       // grey = background
    }
    const r = await cutOutBoards(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
    expect(r.transparent).toBe(true);
    expect(r.boards).toHaveLength(1);
  });

  it("refuses a picture with no board in it", async () => {
    const w = 600, h = 600, data = Buffer.alloc(w * h * 3, 230);
    for (let y = 150; y < 450; y++) for (let x = 150; x < 450; x++) { const i = (y * w + x) * 3; data[i] = 20; data[i + 1] = 90; data[i + 2] = 200; }
    const r = await cutOutBoards(await sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());
    expect(r.boards).toHaveLength(0);
    expect(r.reason).toBeTruthy();
  });

  it("guesses deck then bottom without a key", async () => {
    const keys = ["PD_ANTHROPIC_API_KEY", "PD_OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"];
    const saved = keys.map((k) => process.env[k]);
    keys.forEach((k) => delete process.env[k]);
    try {
      const r = await identifyBoards(await png(picture({ centres: [235, 560], top: 90 })), 2, "standing", "Test 138");
      expect(r.by).toBe("guess");
      expect(r.views.map((v) => v.view)).toEqual(["deck", "bottom"]);
    } finally {
      keys.forEach((k, i) => { if (saved[i] !== undefined) process.env[k] = saved[i]; });
    }
  });

  it("reads the picture and its page out of a Google Images link", async () => {
    // What share.google/… lands on after its two redirects (FMX's Invictus).
    const r = await resolveGoogleImageLink("https://www.google.com/imgres?imgurl=https://www.fmxracing.eu/cdn/shop/files/fmx-racing-invitus-pro-138-2026.jpg?v%3D1762260391%26width%3D762&tbnid=CcGUqtnJxhqDuM&vet=1&imgrefurl=https://www.fmxracing.eu/products/fmx-racing-invictus-2026-pro&docid=G7qGqAXKgwga0M&w=762&h=1100");
    expect(r).toEqual({
      image: "https://www.fmxracing.eu/cdn/shop/files/fmx-racing-invitus-pro-138-2026.jpg?v=1762260391&width=762",
      page: "https://www.fmxracing.eu/products/fmx-racing-invictus-2026-pro",
    });
    // Not a Google link: left to the normal page reader.
    expect(await resolveGoogleImageLink("https://www.fmxracing.eu/products/x")).toEqual({ image: null, page: "https://www.fmxracing.eu/products/x" });
  });

  it.skipIf(!process.env.CUTOUT_FIXTURE || !existsSync(process.env.CUTOUT_FIXTURE ?? ""))("cuts a real picture (local only)", async () => {
    const file = process.env.CUTOUT_FIXTURE!;
    const r = await cutOutBoards(readFileSync(file));
    console.log(JSON.stringify({ layout: r.layout, transparent: r.transparent, reason: r.reason, boards: r.boards.map((b) => ({ box: b.box, aspect: +b.aspect.toFixed(3), coverage: +b.coverage.toFixed(3) })) }));
    for (const b of r.boards) writeFileSync(`${file}.cut${b.index}.webp`, b.webp);
    expect(r.boards.length).toBeGreaterThan(0);
  });
});
