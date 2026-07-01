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

/** Band colours, light→strong, matching the Windguru palette (cyan→magenta). */
export const BFT_META: { bft: Bft; color: string; label: string }[] = [
  { bft: 3, color: "#46cfe6", label: "3+ Bft" },
  { bft: 4, color: "#5ccc2e", label: "4+ Bft" },
  { bft: 5, color: "#ffd21e", label: "5+ Bft" },
  { bft: 6, color: "#f25b27", label: "6+ Bft" },
  { bft: 7, color: "#e0218a", label: "7+ Bft" },
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
};

/** Build a MANUAL climatology from 12 monthly "% planing days (4+ Bft)" values —
    for acceleration spots (Canaries, Tarifa…) where coarse models under-read the
    real wind. Renders as a solid monthly bar; source flags it as NP7 local. */
export function manualWindStats(monthlyPlaningPct: number[]): WindStats {
  const months: WindStatsMonth[] = Array.from({ length: 12 }, (_, i) => {
    const v = Math.max(0, Math.min(100, Math.round(monthlyPlaningPct[i] ?? 0)));
    // 3+ and 4+ both = v so the stacked chart shows one clean band up to v.
    return { m: i + 1, pct: { "3": v, "4": v, "5": 0, "6": 0, "7": 0 }, avgWind: 0, airTemp: null };
  });
  const windyMonths = months.filter((m) => (m.pct["4"] ?? 0) >= 60).map((m) => m.m);
  return {
    source: "NP7 · local knowledge", unit: "kn", window: "planing days",
    period: { start: "", end: "" }, months,
    summary: { windyMonths, warmestMonth: null, warmestTemp: null }, fetchedAt: new Date().toISOString(),
  };
}

type Hourly = { time: string[]; wind: (number | null)[]; temp: (number | null)[] };

async function fetchHourly(url: string): Promise<Hourly | null> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const j = (await res.json()) as { hourly?: { time?: string[]; wind_speed_10m?: (number | null)[]; temperature_2m?: (number | null)[] } };
  const time = j.hourly?.time ?? [];
  if (time.length === 0) return null;
  return { time, wind: j.hourly?.wind_speed_10m ?? [], temp: j.hourly?.temperature_2m ?? [] };
}

const HOURLY = "hourly=wind_speed_10m,temperature_2m&wind_speed_unit=kn&timezone=auto";

/**
 * Monthly wind climatology for a coordinate. Prefers Open-Meteo's archived
 * HIGH-RESOLUTION forecast (best-match model per location — the same family of
 * models a windsurfer reads, so it tracks a spot far better than coarse
 * reanalysis), ~3.5 years; falls back to the 10-year ERA5 archive if that's
 * unavailable. Counts the daytime sailing window (09–18 local).
 */
export async function fetchWindStats(lat: number, lng: number): Promise<WindStats> {
  const end = new Date();
  end.setDate(0); // last day of previous month
  const endStr = end.toISOString().slice(0, 10);
  const coord = `latitude=${lat}&longitude=${lng}`;

  // 1) High-res historical forecast (best match), recent multi-year window.
  const hiStart = `${end.getFullYear() - 3}-01-01`;
  let data = await fetchHourly(`https://historical-forecast-api.open-meteo.com/v1/forecast?${coord}&start_date=${hiStart}&end_date=${endStr}&${HOURLY}&models=best_match`).catch(() => null);
  let source = "Open-Meteo · high-res (best match)";
  let startStr = hiStart;

  // 2) Fallback: 10-year ERA5 reanalysis.
  if (!data || data.time.length < 24 * 120) {
    startStr = `${end.getFullYear() - 10}-01-01`;
    data = await fetchHourly(`https://archive-api.open-meteo.com/v1/archive?${coord}&start_date=${startStr}&end_date=${endStr}&${HOURLY}`);
    source = "Open-Meteo · ERA5 (10-yr)";
  }
  if (!data) throw new Error("No wind data for this location");
  const { time, wind, temp } = data;

  const acc = Array.from({ length: 12 }, () => ({ total: 0, ge: { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as Record<number, number>, windSum: 0, tempSum: 0, tempN: 0 }));
  for (let k = 0; k < time.length; k++) {
    const t = time[k];
    const hr = parseInt(t.slice(11, 13), 10);
    if (hr < 9 || hr > 18) continue; // daytime sailing window
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

  // The "season": months where planing wind (4+ Bft) shows ≥ 60% of sailing hours.
  const windyMonths = months.filter((m) => (m.pct["4"] ?? 0) >= 60).map((m) => m.m);
  let warmestMonth: number | null = null, warmestTemp: number | null = null;
  for (const m of months) if (m.airTemp != null && (warmestTemp == null || m.airTemp > warmestTemp)) { warmestTemp = m.airTemp; warmestMonth = m.m; }

  return {
    source, unit: "kn", window: "09–18 local", period: { start: startStr, end: endStr },
    months, summary: { windyMonths, warmestMonth, warmestTemp }, fetchedAt: new Date().toISOString(),
  };
}
