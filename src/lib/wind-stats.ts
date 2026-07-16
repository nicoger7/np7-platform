/**
 * Wind climatology from coordinates, via Open-Meteo's ERA5 archive (free, no
 * API key). Reproduces the Windguru "Statistics" view: for each month, the % of
 * daytime hours at or above each Beaufort threshold (3+ … 7+) over ~10 years,
 * plus mean daytime air temperature. Cached per spot in spots.wind_stats.
 *
 * Pure-ish module (uses global fetch) — the chart imports the meta/types; the
 * fetch runs server-side (admin action + cron).
 */

export const BFT_THRESHOLDS = [3, 4, 5, 6, 7] as const;
export type Bft = (typeof BFT_THRESHOLDS)[number];

/** Lower bound of each Beaufort force, in knots. "3+" = wind ≥ 7 kn, etc. */
export const BEAUFORT_KN: Record<Bft, number> = { 3: 7, 4: 11, 5: 17, 6: 22, 7: 28 };

/** Band colours, light→strong. Same ordinal read as Windguru (cool → warm =
 *  light → strong) but toned to the brand: misty cyan → sea teal → warm gold
 *  → coral → deep berry, instead of neon primaries. */
export const BFT_META: { bft: Bft; color: string; label: string }[] = [
  { bft: 3, color: "#9ad6e3", label: "3+ Bft" },
  { bft: 4, color: "#2fb3a0", label: "4+ Bft" },
  { bft: 5, color: "#f0b429", label: "5+ Bft" },
  { bft: 6, color: "#ee6f3f", label: "6+ Bft" },
  { bft: 7, color: "#b43a6e", label: "7+ Bft" },
];

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type WindStatsMonth = {
  m: number;                       // 1–12
  pct: Record<string, number>;     // { "3": 83, "4": 58, … } — cumulative % ≥ that Bft
  avgWind: number;                 // mean daytime wind, kn
  airTemp: number | null;          // mean daytime air temp, °C
};
export type WindStats = {
  source: string; unit: "kn"; window: string;
  period: { start: string; end: string };
  months: WindStatsMonth[];
  /** Smart readout the bar chart shows above itself. */
  summary: { windyMonths: number[]; warmestMonth: number | null; warmestTemp: number | null };
  fetchedAt: string;
  /** Alternative model read (offshore/accelerated sampling). When present the
      chart shows a model switcher so the rider can compare both. */
  alt?: Omit<WindStats, "alt">;
};

type Hourly = { time: string[]; wind: (number | null)[]; temp: (number | null)[] };
type RawHourly = { time?: string[]; wind_speed_10m?: (number | null)[]; temperature_2m?: (number | null)[] };
const toHourly = (h?: RawHourly): Hourly | null => (h?.time?.length ? { time: h.time, wind: h.wind_speed_10m ?? [], temp: h.temperature_2m ?? [] } : null);

async function fetchHourly(url: string): Promise<Hourly | null> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return toHourly(((await res.json()) as { hourly?: RawHourly }).hourly);
}

// Open-Meteo accepts comma-separated coordinates and returns an array — one call
// for a whole ring of sample points.
async function fetchHourlyMulti(url: string): Promise<(Hourly | null)[]> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const j = await res.json();
  const arr = Array.isArray(j) ? j : [j];
  return arr.map((x: { hourly?: RawHourly }) => toHourly(x.hourly));
}

const HOURLY = "hourly=wind_speed_10m,temperature_2m&wind_speed_unit=kn&timezone=auto";
const ACCEL_RADIUS_KM = 12; // acceleration zones read true a few km offshore, not at the coastal pin
                            // (El Médano: pin 5 kn/10%, ring-max ~95% planing in Jul, 62% annual — matches reality)

/** A pin plus a ring of points at `radiusKm` around it (8 compass directions). */
function ringPoints(lat: number, lng: number, radiusKm: number): { lat: number; lng: number }[] {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const pts = [{ lat, lng }];
  for (let a = 0; a < 360; a += 45) {
    const r = (a * Math.PI) / 180;
    pts.push({ lat: +(lat + dLat * Math.cos(r)).toFixed(4), lng: +(lng + dLng * Math.sin(r)).toFixed(4) });
  }
  return pts;
}

/** Aggregate hourly wind/temp into the monthly Beaufort climatology (daytime 09–18). */
function monthsFromHourly({ time, wind, temp }: Hourly): { months: WindStatsMonth[]; windyMonths: number[]; warmestMonth: number | null; warmestTemp: number | null; planingScore: number } {
  const acc = Array.from({ length: 12 }, () => ({ total: 0, ge: { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as Record<number, number>, windSum: 0, tempSum: 0, tempN: 0 }));
  for (let k = 0; k < time.length; k++) {
    const t = time[k];
    const hr = parseInt(t.slice(11, 13), 10);
    if (hr < 9 || hr > 18) continue;
    const a = acc[parseInt(t.slice(5, 7), 10) - 1];
    const w = wind[k];
    if (w == null) continue;
    a.total++; a.windSum += w;
    for (const b of BFT_THRESHOLDS) if (w >= BEAUFORT_KN[b]) a.ge[b]++;
    const tp = temp[k];
    if (tp != null) { a.tempSum += tp; a.tempN++; }
  }
  const months: WindStatsMonth[] = acc.map((a, i) => ({
    m: i + 1,
    pct: Object.fromEntries(BFT_THRESHOLDS.map((b) => [String(b), a.total ? Math.round((a.ge[b] / a.total) * 100) : 0])),
    avgWind: a.total ? Math.round(a.windSum / a.total) : 0,
    airTemp: a.tempN ? Math.round(a.tempSum / a.tempN) : null,
  }));
  const windyMonths = months.filter((m) => (m.pct["4"] ?? 0) >= 60).map((m) => m.m);
  let warmestMonth: number | null = null, warmestTemp: number | null = null;
  for (const m of months) if (m.airTemp != null && (warmestTemp == null || m.airTemp > warmestTemp)) { warmestTemp = m.airTemp; warmestMonth = m.m; }
  const planingScore = months.reduce((s, m) => s + (m.pct["4"] ?? 0), 0) / 12; // mean monthly planing %
  return { months, windyMonths, warmestMonth, warmestTemp, planingScore };
}

/**
 * Monthly wind climatology for a coordinate. Prefers Open-Meteo's archived
 * HIGH-RESOLUTION forecast (best-match model per location), ~3.5 years; falls
 * back to the 10-year ERA5 archive. Counts the daytime sailing window (09–18).
 *
 * `accelerated`: for venturi/thermal spots (Canaries, Tarifa…) the model reads
 * the coastal pin in terrain shadow (El Médano: 5 kn / 10% planing) while the
 * real accelerated flow shows a few km offshore (10 km SE: 20 kn / 79%). So we
 * sample a ring around the pin and use the WINDIEST point — the flow a rider
 * actually gets once out on the water. Zero manual input.
 */
export async function fetchWindStats(lat: number, lng: number, opts?: { accelerated?: boolean }): Promise<WindStats> {
  const end = new Date();
  end.setDate(0); // last day of previous month
  const endStr = end.toISOString().slice(0, 10);
  const hiStart = `${end.getFullYear() - 3}-01-01`;

  if (opts?.accelerated) {
    const pts = ringPoints(lat, lng, ACCEL_RADIUS_KM);
    const lats = pts.map((p) => p.lat).join(",");
    const lngs = pts.map((p) => p.lng).join(",");
    const series = await fetchHourlyMulti(`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&start_date=${hiStart}&end_date=${endStr}&${HOURLY}&models=best_match`).catch(() => []);
    let best: ReturnType<typeof monthsFromHourly> | null = null;
    for (const s of series) {
      if (!s || s.time.length < 24 * 120) continue;
      const agg = monthsFromHourly(s);
      if (!best || agg.planingScore > best.planingScore) best = agg;
    }
    if (best) {
      return {
        source: "Open-Meteo · accelerated (offshore)", unit: "kn", window: "09–18 local",
        period: { start: hiStart, end: endStr }, months: best.months,
        summary: { windyMonths: best.windyMonths, warmestMonth: best.warmestMonth, warmestTemp: best.warmestTemp },
        fetchedAt: new Date().toISOString(),
      };
    }
    // fall through to standard if the ring came back empty
  }

  const coord = `latitude=${lat}&longitude=${lng}`;
  let data = await fetchHourly(`https://historical-forecast-api.open-meteo.com/v1/forecast?${coord}&start_date=${hiStart}&end_date=${endStr}&${HOURLY}&models=best_match`).catch(() => null);
  let source = "Open-Meteo · high-res (best match)";
  let startStr = hiStart;
  if (!data || data.time.length < 24 * 120) {
    startStr = `${end.getFullYear() - 10}-01-01`;
    data = await fetchHourly(`https://archive-api.open-meteo.com/v1/archive?${coord}&start_date=${startStr}&end_date=${endStr}&${HOURLY}`);
    source = "Open-Meteo · ERA5 (10-yr)";
  }
  if (!data) throw new Error("No wind data for this location");
  const agg = monthsFromHourly(data);
  return {
    source, unit: "kn", window: "09–18 local", period: { start: startStr, end: endStr },
    months: agg.months, summary: { windyMonths: agg.windyMonths, warmestMonth: agg.warmestMonth, warmestTemp: agg.warmestTemp },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * BOTH model reads in one blob, so the rider can switch between them on demand:
 * the coastal-pin read and the offshore/accelerated read. `primary` picks which
 * one shows first (`main`); the other becomes `alt`. We keep `alt` whenever the
 * second read exists and differs *at all* from the first (only a spot where the
 * two are byte-identical drops it — a toggle between identical charts is
 * pointless). Falls back to a single read if the second can't be computed.
 */
export async function fetchWindStatsBoth(lat: number, lng: number, primary: "standard" | "accelerated" = "standard"): Promise<WindStats> {
  const [standard, offshore] = await Promise.all([
    fetchWindStats(lat, lng).catch(() => null),
    fetchWindStats(lat, lng, { accelerated: true }).catch(() => null),
  ]);
  const main = (primary === "accelerated" ? offshore : standard) ?? standard ?? offshore;
  const other = primary === "accelerated" ? standard : offshore;
  if (!main) throw new Error("No wind data for this location");
  const strip = (s: WindStats): Omit<WindStats, "alt"> => { const { alt: _drop, ...rest } = s; return rest; };
  if (!other || other === main || other.source === main.source) return strip(main);
  const differs = main.months.some((m, i) =>
    BFT_THRESHOLDS.some((b) => (m.pct[String(b)] ?? 0) !== (other.months[i]?.pct[String(b)] ?? 0)));
  return differs ? { ...strip(main), alt: strip(other) } : strip(main);
}
