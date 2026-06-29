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
  fetchedAt: string;
};

/** Compute monthly wind climatology for a coordinate. ~10 years, 09–18 local. */
export async function fetchWindStats(lat: number, lng: number): Promise<WindStats> {
  const end = new Date();
  end.setDate(1); end.setDate(0); // last day of previous month
  const endStr = end.toISOString().slice(0, 10);
  const startStr = `${end.getFullYear() - 10}-01-01`;

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startStr}&end_date=${endStr}` +
    `&hourly=wind_speed_10m,temperature_2m&wind_speed_unit=kn&timezone=auto`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = (await res.json()) as { hourly?: { time?: string[]; wind_speed_10m?: (number | null)[]; temperature_2m?: (number | null)[] } };
  const time = j.hourly?.time ?? [];
  const wind = j.hourly?.wind_speed_10m ?? [];
  const temp = j.hourly?.temperature_2m ?? [];
  if (time.length === 0) throw new Error("No data for this location");

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

  return { source: "Open-Meteo · ERA5", unit: "kn", window: "09–18 local", period: { start: startStr, end: endStr }, months, fetchedAt: new Date().toISOString() };
}
