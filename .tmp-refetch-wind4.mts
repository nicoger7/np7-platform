import { createClient } from "@supabase/supabase-js";
import { fetchWindStatsBoth } from "./src/lib/wind-stats";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Alle mit accelerated-Ring (neue Punktwahl) + die 6 Rate-Limit-Opfer
const TARGETS = ["alacati","bonaire","emerald-sea","tarifa","tenerife","outer-banks","ostsee-eckernf-rder-bucht-17xo","fuerteventura","laghi-alimini-xz0x","lake-garda","langebaan","le-morne-5wp3","maui"];
const { data: rows } = await db.from("destinations").select("id,slug,lat,lng,wind_stats").in("slug", TARGETS);

console.log("Warte 120s (Rate-Limit-Puffer)…");
await new Promise((r) => setTimeout(r, 120_000));

for (const d of rows ?? []) {
  const prevSource = String((d.wind_stats as { source?: string } | null)?.source ?? "");
  const primary = prevSource.includes("accelerated") ? "accelerated" as const : "standard" as const;
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      const stats = await fetchWindStatsBoth(Number(d.lat), Number(d.lng), primary);
      await db.from("destinations").update({ wind_stats: stats }).eq("id", d.id);
      const best = Math.max(...stats.months.map((m) => m.dayPct ?? 0));
      const aug = stats.months.find((m) => m.m === 8);
      console.log(`${d.slug}: ok (${primary}) — Aug ${aug?.dayPct}% · bester Monat ${best}%${best < 40 ? " → BLIND" : ""}`);
      done = true;
    } catch {
      console.log(`${d.slug}: Versuch ${attempt} — warte 120s`);
      await new Promise((r) => setTimeout(r, 120_000));
    }
  }
  await new Promise((r) => setTimeout(r, 30_000));
}
console.log("FERTIG");
